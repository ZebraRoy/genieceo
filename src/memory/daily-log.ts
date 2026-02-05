/**
 * DailyLogSystem - Append-only daily logs
 * 
 * Stores logs in workspace/memory/daily/YYYY-MM-DD.md format
 * Tracks decisions, task results, learnings, conversations, service events
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DailyLogEntry } from '../types';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);

export class DailyLogSystem {
  private basePath: string; // workspace/memory/daily/

  constructor(workspacePath: string) {
    this.basePath = path.join(workspacePath, 'memory', 'daily');
  }

  /**
   * Log an entry (appends to today's log)
   */
  async log(entry: DailyLogEntry): Promise<void> {
    try {
      await mkdir(this.basePath, { recursive: true });

      const logPath = this.getLogPath(entry.timestamp);
      const formattedEntry = this.formatEntry(entry);

      // Check if file exists
      const exists = await this.fileExists(logPath);
      
      if (!exists) {
        // Create new log file with header
        const header = this.createHeader(entry.timestamp);
        await writeFile(logPath, header + formattedEntry, 'utf-8');
      } else {
        // Append to existing log
        await appendFile(logPath, formattedEntry, 'utf-8');
      }
    } catch (error) {
      console.error('Failed to write daily log:', error);
    }
  }

  /**
   * Get today's log entries
   */
  async getTodayLog(): Promise<DailyLogEntry[]> {
    return this.getLogForDate(new Date());
  }

  /**
   * Get log entries for a specific date
   */
  async getLogForDate(date: Date): Promise<DailyLogEntry[]> {
    try {
      const logPath = this.getLogPath(date);
      const content = await readFile(logPath, 'utf-8');
      return this.parseLog(content);
    } catch (error) {
      return []; // Log doesn't exist or is empty
    }
  }

  /**
   * Get recent context from logs (last N entries across all dates)
   */
  async getRecentContext(maxEntries: number = 20): Promise<string> {
    try {
      // Get all log files sorted by date (newest first)
      const logFiles = await this.getLogFiles();
      
      const entries: DailyLogEntry[] = [];
      
      for (const file of logFiles) {
        if (entries.length >= maxEntries) break;
        
        const logPath = path.join(this.basePath, file);
        const content = await readFile(logPath, 'utf-8');
        const dayEntries = this.parseLog(content);
        
        // Add entries (newest first within each day)
        for (const entry of dayEntries.reverse()) {
          if (entries.length >= maxEntries) break;
          entries.push(entry);
        }
      }

      // Format as summary
      return this.formatRecentContext(entries);
      
    } catch (error) {
      return 'No recent log entries';
    }
  }

  /**
   * Get all log files, sorted by date (newest first)
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.basePath);
      return files
        .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
        .sort()
        .reverse(); // Newest first
    } catch (error) {
      return [];
    }
  }

  /**
   * Format an entry for the log file
   */
  private formatEntry(entry: DailyLogEntry): string {
    const time = entry.timestamp.toTimeString().slice(0, 5); // HH:MM
    const icon = this.getTypeIcon(entry.type);
    
    let formatted = `\n## ${time} ${icon} ${this.formatType(entry.type)} by ${entry.actor}\n\n`;
    formatted += entry.content + '\n';
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      formatted += '\n```json\n' + JSON.stringify(entry.metadata, null, 2) + '\n```\n';
    }
    
    return formatted;
  }

  /**
   * Create header for a new log file
   */
  private createHeader(date: Date): string {
    const dateStr = this.formatDate(date);
    return `# Daily Log: ${dateStr}\n\n`;
  }

  /**
   * Parse log file content into entries
   */
  private parseLog(content: string): DailyLogEntry[] {
    const entries: DailyLogEntry[] = [];
    
    // Split by ## headers (each entry starts with ##)
    const sections = content.split(/\n## /);
    
    for (const section of sections.slice(1)) { // Skip first (header)
      try {
        const lines = section.split('\n');
        const headerLine = lines[0];
        
        // Parse header: "HH:MM 🔵 Type by actor"
        const match = headerLine.match(/^(\d{2}:\d{2})\s+\S+\s+(.+?)\s+by\s+(.+)$/);
        if (!match) continue;
        
        const [, time, typeStr, actor] = match;
        const type = this.parseType(typeStr);
        
        // Get content (everything after header, before metadata)
        const contentLines: string[] = [];
        let inMetadata = false;
        
        for (const line of lines.slice(1)) {
          if (line.trim().startsWith('```json')) {
            inMetadata = true;
            continue;
          }
          if (inMetadata && line.trim() === '```') {
            break;
          }
          if (!inMetadata) {
            contentLines.push(line);
          }
        }
        
        entries.push({
          timestamp: new Date(), // We don't store full date in time string
          type,
          actor: actor as any,
          content: contentLines.join('\n').trim(),
        });
        
      } catch (error) {
        // Skip malformed entries
      }
    }
    
    return entries;
  }

  /**
   * Format recent entries as context summary
   */
  private formatRecentContext(entries: DailyLogEntry[]): string {
    if (entries.length === 0) return 'No recent activity';
    
    let context = '# Recent Activity\n\n';
    
    for (const entry of entries) {
      const time = entry.timestamp.toISOString();
      context += `- **${entry.type}** (${entry.actor}): ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}\n`;
    }
    
    return context;
  }

  /**
   * Get log file path for a date
   */
  private getLogPath(date: Date): string {
    const dateStr = this.formatDate(date);
    return path.join(this.basePath, `${dateStr}.md`);
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await promisify(fs.access)(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get icon for entry type
   */
  private getTypeIcon(type: DailyLogEntry['type']): string {
    const icons = {
      decision: '🎯',
      task_result: '✅',
      learning: '💡',
      conversation: '💬',
      service_event: '⚙️',
    };
    return icons[type] || '📝';
  }

  /**
   * Format type for display
   */
  private formatType(type: DailyLogEntry['type']): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Parse type string back to type
   */
  private parseType(typeStr: string): DailyLogEntry['type'] {
    const normalized = typeStr.toLowerCase().replace(/\s+/g, '_');
    return normalized as DailyLogEntry['type'];
  }

  /**
   * Archive old logs (move to archive subdirectory)
   * Useful for keeping active logs clean
   */
  async archiveOldLogs(daysOld: number): Promise<void> {
    try {
      const archivePath = path.join(this.basePath, 'archive');
      await mkdir(archivePath, { recursive: true });
      
      const files = await readdir(this.basePath);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        if (!file.match(/^\d{4}-\d{2}-\d{2}\.md$/)) continue;
        
        const dateStr = file.replace('.md', '');
        const fileDate = new Date(dateStr);
        
        if (fileDate < cutoffDate) {
          const oldPath = path.join(this.basePath, file);
          const newPath = path.join(archivePath, file);
          await promisify(fs.rename)(oldPath, newPath);
        }
      }
    } catch (error) {
      console.warn('Failed to archive old logs:', error);
    }
  }
}
