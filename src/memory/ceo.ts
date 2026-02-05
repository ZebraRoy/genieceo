/**
 * GenieCEOMemoryStore - Manages GenieCEO's memory and state
 * 
 * Tracks:
 * - Active staff processes (ephemeral)
 * - Running services (persistent)
 * - Context budget (token usage)
 * - Working memory (key-value)
 * - Conversation history (with compaction)
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  StaffProcess,
  ServiceProcess,
  ContextBudget,
  Message,
} from '../types';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const appendFile = promisify(fs.appendFile);

export class GenieCEOMemoryStore {
  private basePath: string; // workspace/memory/ceo/
  
  // In-memory state
  private activeProcesses: Map<string, StaffProcess> = new Map();
  private services: Map<string, ServiceProcess> = new Map();
  private workingMemory: Map<string, any> = new Map();
  
  // Context budget tracking
  private contextBudget: ContextBudget = {
    genieCEOCurrentTokens: 0,
    genieCEOMaxTokens: 50000,
    compactionCount: 0,
  };

  // File paths
  private workingMemoryPath: string;
  private conversationPath: string;
  private servicesPath: string;

  constructor(workspacePath: string) {
    this.basePath = path.join(workspacePath, 'memory', 'ceo');
    this.workingMemoryPath = path.join(this.basePath, 'working-memory.json');
    this.conversationPath = path.join(this.basePath, 'conversation.jsonl');
    this.servicesPath = path.join(this.basePath, 'services.json');
  }

  // ============================================================================
  // Staff Process Management (ephemeral)
  // ============================================================================

  /**
   * Add a new active staff process
   */
  addActiveProcess(process: StaffProcess): void {
    this.activeProcesses.set(process.id, process);
  }

  /**
   * Update staff process status
   */
  updateProcessStatus(id: string, updates: Partial<StaffProcess>): void {
    const process = this.activeProcesses.get(id);
    if (process) {
      Object.assign(process, updates);
    }
  }

  /**
   * Get all active staff processes
   */
  getActiveProcesses(): StaffProcess[] {
    return Array.from(this.activeProcesses.values());
  }

  /**
   * Get a specific staff process
   */
  getProcess(id: string): StaffProcess | undefined {
    return this.activeProcesses.get(id);
  }

  /**
   * Check if a staff member is currently working
   */
  isStaffWorking(staffName: string): boolean {
    return Array.from(this.activeProcesses.values()).some(
      p => p.staffName === staffName && 
           (p.status === 'spawning' || p.status === 'working')
    );
  }

  /**
   * Remove completed/failed processes (cleanup)
   */
  cleanupCompletedProcesses(): void {
    for (const [id, process] of this.activeProcesses.entries()) {
      if (process.status === 'completed' || process.status === 'failed') {
        this.activeProcesses.delete(id);
      }
    }
  }

  // ============================================================================
  // Service Management (persistent)
  // ============================================================================

  /**
   * Add a new service
   */
  addService(service: ServiceProcess): void {
    this.services.set(service.id, service);
  }

  /**
   * Update service state
   */
  updateService(id: string, updates: Partial<ServiceProcess>): void {
    const service = this.services.get(id);
    if (service) {
      Object.assign(service, updates);
    }
  }

  /**
   * Get all services
   */
  getServices(): ServiceProcess[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a specific service
   */
  getService(id: string): ServiceProcess | undefined {
    return this.services.get(id);
  }

  /**
   * Get service by port number
   */
  getServiceByPort(port: number): ServiceProcess | undefined {
    return Array.from(this.services.values()).find(s => s.port === port);
  }

  /**
   * Remove a service
   */
  removeService(id: string): void {
    this.services.delete(id);
  }

  /**
   * Get running services only
   */
  getRunningServices(): ServiceProcess[] {
    return Array.from(this.services.values()).filter(
      s => s.status === 'running' || s.status === 'starting'
    );
  }

  // ============================================================================
  // Context Budget Management
  // ============================================================================

  /**
   * Update current token count
   */
  updateContextBudget(tokens: number): void {
    this.contextBudget.genieCEOCurrentTokens = tokens;
  }

  /**
   * Check if compaction is needed (> 45K tokens)
   */
  shouldCompact(): boolean {
    return this.contextBudget.genieCEOCurrentTokens > 45000;
  }

  /**
   * Get context budget info
   */
  getContextBudget(): ContextBudget {
    return { ...this.contextBudget };
  }

  /**
   * Record that compaction occurred
   */
  recordCompaction(): void {
    this.contextBudget.lastCompactionAt = new Date();
    this.contextBudget.compactionCount++;
    // Reset token count (will be recalculated)
    this.contextBudget.genieCEOCurrentTokens = 0;
  }

  // ============================================================================
  // Working Memory (key-value storage, use sparingly)
  // ============================================================================

  /**
   * Store a value in working memory
   */
  async remember(key: string, value: any): Promise<void> {
    this.workingMemory.set(key, value);
  }

  /**
   * Recall a value from working memory
   */
  async recall(key: string): Promise<any> {
    return this.workingMemory.get(key);
  }

  /**
   * Remove a value from working memory
   */
  async forget(key: string): Promise<void> {
    this.workingMemory.delete(key);
  }

  /**
   * Get all working memory keys
   */
  getMemoryKeys(): string[] {
    return Array.from(this.workingMemory.keys());
  }

  // ============================================================================
  // Conversation History (JSONL format for compaction)
  // ============================================================================

  /**
   * Append a message to conversation history
   */
  async appendMessage(message: Message): Promise<void> {
    const line = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date(),
    }) + '\n';
    
    try {
      await appendFile(this.conversationPath, line, 'utf-8');
    } catch (error) {
      // File doesn't exist, create it
      await writeFile(this.conversationPath, line, 'utf-8');
    }
  }

  /**
   * Get recent messages from conversation history
   */
  async getRecentMessages(limit: number = 50): Promise<Message[]> {
    try {
      const content = await readFile(this.conversationPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      
      // Get last N lines
      const recentLines = lines.slice(-limit);
      
      return recentLines.map(line => {
        const msg = JSON.parse(line);
        return {
          ...msg,
          timestamp: new Date(msg.timestamp),
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear conversation history (after compaction)
   */
  async clearConversationHistory(): Promise<void> {
    try {
      await writeFile(this.conversationPath, '', 'utf-8');
    } catch (error) {
      // Ignore
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Load all data from disk
   */
  async load(): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(this.basePath, { recursive: true });

      // Load working memory
      try {
        const wmContent = await readFile(this.workingMemoryPath, 'utf-8');
        const wmData = JSON.parse(wmContent);
        this.workingMemory = new Map(Object.entries(wmData.memory || {}));
        
        if (wmData.contextBudget) {
          this.contextBudget = {
            ...wmData.contextBudget,
            lastCompactionAt: wmData.contextBudget.lastCompactionAt 
              ? new Date(wmData.contextBudget.lastCompactionAt)
              : undefined,
          };
        }
      } catch (error) {
        // File doesn't exist or is invalid, use defaults
      }

      // Load services
      try {
        const servicesContent = await readFile(this.servicesPath, 'utf-8');
        const servicesData = JSON.parse(servicesContent);
        
        this.services = new Map(
          servicesData.map((s: any) => [
            s.id,
            {
              ...s,
              startedAt: new Date(s.startedAt),
              stoppedAt: s.stoppedAt ? new Date(s.stoppedAt) : undefined,
            },
          ])
        );
      } catch (error) {
        // File doesn't exist, use empty map
      }

    } catch (error) {
      console.warn('Failed to load GenieCEO memory:', error);
    }
  }

  /**
   * Save all data to disk
   */
  async save(): Promise<void> {
    try {
      await mkdir(this.basePath, { recursive: true });

      // Save working memory and context budget
      const wmData = {
        memory: Object.fromEntries(this.workingMemory),
        contextBudget: this.contextBudget,
      };
      await writeFile(
        this.workingMemoryPath,
        JSON.stringify(wmData, null, 2),
        'utf-8'
      );

      // Save services
      const servicesData = Array.from(this.services.values());
      await writeFile(
        this.servicesPath,
        JSON.stringify(servicesData, null, 2),
        'utf-8'
      );

    } catch (error) {
      console.error('Failed to save GenieCEO memory:', error);
    }
  }

  /**
   * Export state for debugging
   */
  exportState(): any {
    return {
      activeProcesses: Array.from(this.activeProcesses.values()),
      services: Array.from(this.services.values()),
      workingMemory: Object.fromEntries(this.workingMemory),
      contextBudget: this.contextBudget,
    };
  }
}
