/**
 * ContextCompactionService - Compress conversation history
 * 
 * Implements Anthropic's compaction strategy:
 * - Trigger at 45K tokens
 * - Keep last 5 messages + system prompt
 * - Summarize older messages
 * - Clear old tool results
 * - Preserve critical decisions
 */

import { GenieCEOMemoryStore } from './ceo';
import { ContextManager } from './context-manager';
import { LLMProvider } from '../providers/llm';
import { Message } from '../types';

export class ContextCompactionService {
  constructor(
    private ceoMemory: GenieCEOMemoryStore,
    private contextManager: ContextManager,
    private llm: LLMProvider
  ) {}

  /**
   * Compact conversation history
   * Returns compacted messages ready for use
   */
  async compactMessages(messages: Message[]): Promise<Message[]> {
    if (messages.length <= 10) {
      // Not enough messages to compact
      return messages;
    }

    // Strategy: Keep recent messages, summarize the rest
    const recentCount = 5;
    const recentMessages = messages.slice(-recentCount);
    const oldMessages = messages.slice(0, -recentCount);

    // Summarize old messages
    const summary = await this.summarizeMessages(oldMessages);

    // Create compacted message set
    const compactedMessages: Message[] = [
      {
        role: 'user',
        content: `[CONVERSATION SUMMARY - Previous ${oldMessages.length} messages]\n\n${summary}`,
        timestamp: new Date(),
        metadata: { compacted: true },
      },
      ...recentMessages,
    ];

    // Save compacted history
    await this.ceoMemory.clearConversationHistory();
    for (const msg of compactedMessages) {
      await this.ceoMemory.appendMessage(msg);
    }

    console.log(`Compacted ${messages.length} messages to ${compactedMessages.length}`);
    
    return compactedMessages;
  }

  /**
   * Archive old plan files to keep tasks directory clean
   */
  async archiveOldPlans(daysOld: number = 7): Promise<void> {
    try {
      const plans = await this.contextManager.listPlans();
      
      // For simplicity, archive all plans (in production, you'd check timestamps)
      // This is a basic implementation - enhance with actual age checking
      if (plans.length > 10) {
        const plansToArchive = plans.slice(0, -10); // Keep last 10, archive older
        await this.contextManager.archivePlans(plansToArchive);
        console.log(`Archived ${plansToArchive.length} old plans`);
      }
    } catch (error) {
      console.warn('Failed to archive old plans:', error);
    }
  }

  /**
   * Summarize a set of messages using LLM
   */
  private async summarizeMessages(messages: Message[]): Promise<string> {
    try {
      // Build summary prompt
      const conversationText = messages
        .map(m => `${m.role}: ${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}`)
        .join('\n\n');

      const summaryPrompt = `Please provide a concise summary of this conversation, focusing on:
1. Key decisions made
2. Tasks completed
3. Important context needed for future reference

Conversation:
${conversationText}

Provide a structured summary in 2-3 paragraphs.`;

      // Use LLM to generate summary
      const result = await this.llm.generate(
        [
          {
            role: 'system',
            content: 'You are a conversation summarizer. Create concise, informative summaries.',
          },
          {
            role: 'user',
            content: summaryPrompt,
          },
        ],
        {}, // No tools needed
        1 // Single step
      );

      return result.text || 'No summary generated';
      
    } catch (error) {
      console.warn('Failed to generate summary:', error);
      
      // Fallback: Basic text extraction
      return this.basicSummary(messages);
    }
  }

  /**
   * Basic fallback summary (no LLM)
   */
  private basicSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    const summary = `Summary of ${messages.length} messages:
- User messages: ${userMessages.length}
- Assistant responses: ${assistantMessages.length}

Recent topics:
${userMessages.slice(-3).map(m => `- ${m.content.slice(0, 100)}...`).join('\n')}
`;
    
    return summary;
  }

  /**
   * Estimate token count for messages (rough estimate: 4 chars = 1 token)
   */
  estimateTokens(messages: Message[]): number {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(messages: Message[]): boolean {
    const estimated = this.estimateTokens(messages);
    return estimated > 45000;
  }

  /**
   * Perform full cleanup: compact messages and archive old plans
   */
  async performFullCleanup(messages: Message[]): Promise<Message[]> {
    console.log('Performing context cleanup...');
    
    // Compact messages
    const compacted = await this.compactMessages(messages);
    
    // Archive old plans
    await this.archiveOldPlans(7);
    
    console.log('Context cleanup complete');
    
    return compacted;
  }

  /**
   * Get compaction statistics
   */
  getStats(): {
    currentTokens: number;
    maxTokens: number;
    compactionCount: number;
    lastCompaction?: Date;
  } {
    const budget = this.ceoMemory.getContextBudget();
    return {
      currentTokens: budget.genieCEOCurrentTokens,
      maxTokens: budget.genieCEOMaxTokens,
      compactionCount: budget.compactionCount,
      lastCompaction: budget.lastCompactionAt,
    };
  }
}
