/**
 * ServiceManager - Manages long-running processes (empowerment)
 * 
 * GenieCEO can create and run applications:
 * - Web servers, APIs, webhooks, daemons
 * - Start/stop/restart services
 * - Health monitoring with auto-recovery
 * - View logs for debugging
 * - Manage multiple services simultaneously
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { promisify } from 'util';
import { ServiceProcess } from '../../types';
import { GenieCEOMemoryStore } from '../../memory/ceo';
import { DailyLogSystem } from '../../memory/daily-log';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export class ServiceManager {
  private ceoMemory: GenieCEOMemoryStore;
  private dailyLog: DailyLogSystem;
  private workspacePath: string;
  private logsPath: string;
  private monitorInterval?: NodeJS.Timeout;

  constructor(
    ceoMemory: GenieCEOMemoryStore,
    dailyLog: DailyLogSystem,
    workspacePath: string
  ) {
    this.ceoMemory = ceoMemory;
    this.dailyLog = dailyLog;
    this.workspacePath = workspacePath;
    this.logsPath = path.join(workspacePath, 'memory', 'services', 'logs');
  }

  // ============================================================================
  // Service Lifecycle
  // ============================================================================

  /**
   * Start a new service
   */
  async startService(config: {
    name: string;
    type: ServiceProcess['type'];
    command: string;
    workingDir: string;
    port?: number;
    healthCheckUrl?: string;
    autoRestart?: boolean;
    env?: Record<string, string>;
  }): Promise<ServiceProcess> {
    try {
      // Ensure logs directory exists
      await mkdir(this.logsPath, { recursive: true });

      // Generate service ID
      const id = this.generateServiceId(config.name);

      // Prepare log file
      const logFile = path.join(this.logsPath, `${id}.log`);

      // Check if port is already in use
      if (config.port) {
        const existing = this.ceoMemory.getServiceByPort(config.port);
        if (existing && existing.status === 'running') {
          throw new Error(`Port ${config.port} is already in use by service ${existing.id}`);
        }
      }

      // Create service process object
      const service: ServiceProcess = {
        id,
        name: config.name,
        type: config.type,
        status: 'starting',
        startedAt: new Date(),
        port: config.port,
        healthCheckUrl: config.healthCheckUrl,
        autoRestart: config.autoRestart !== false, // Default true
        restartCount: 0,
        logFile,
        workingDir: config.workingDir,
        command: config.command,
        env: config.env,
      };

      // Add to memory
      this.ceoMemory.addService(service);

      // Start the process
      await this.spawnProcess(service);

      // Log the event
      await this.dailyLog.log({
        timestamp: new Date(),
        type: 'service_event',
        actor: 'genieceo',
        content: `Started service "${config.name}" (${id}) - ${config.type}`,
        metadata: { serviceId: id, port: config.port },
      });

      return service;
      
    } catch (error) {
      throw new Error(`Failed to start service: ${error}`);
    }
  }

  /**
   * Stop a running service
   */
  async stopService(id: string): Promise<void> {
    const service = this.ceoMemory.getService(id);
    
    if (!service) {
      throw new Error(`Service ${id} not found`);
    }

    if (!service.pid) {
      throw new Error(`Service ${id} has no PID (already stopped?)`);
    }

    try {
      // Kill the process
      process.kill(service.pid, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force kill if still running
      try {
        process.kill(service.pid, 0); // Check if still alive
        process.kill(service.pid, 'SIGKILL'); // Force kill
      } catch {
        // Process is dead, good
      }

      // Update status
      this.ceoMemory.updateService(id, {
        status: 'stopped',
        stoppedAt: new Date(),
        pid: undefined,
      });

      await this.dailyLog.log({
        timestamp: new Date(),
        type: 'service_event',
        actor: 'genieceo',
        content: `Stopped service "${service.name}" (${id})`,
        metadata: { serviceId: id },
      });

    } catch (error) {
      throw new Error(`Failed to stop service: ${error}`);
    }
  }

  /**
   * Restart a service
   */
  async restartService(id: string): Promise<void> {
    const service = this.ceoMemory.getService(id);
    
    if (!service) {
      throw new Error(`Service ${id} not found`);
    }

    // Stop if running
    if (service.pid) {
      await this.stopService(id);
    }

    // Update status
    this.ceoMemory.updateService(id, {
      status: 'restarting',
      restartCount: (service.restartCount || 0) + 1,
    });

    // Start again
    await this.spawnProcess(service);

    await this.dailyLog.log({
      timestamp: new Date(),
      type: 'service_event',
      actor: 'genieceo',
      content: `Restarted service "${service.name}" (${id})`,
      metadata: { serviceId: id, restartCount: service.restartCount },
    });
  }

  // ============================================================================
  // Process Management
  // ============================================================================

  /**
   * Spawn the actual process
   */
  private async spawnProcess(service: ServiceProcess): Promise<void> {
    try {
      // Parse command
      const [cmd, ...args] = service.command!.split(' ');

      // Prepare environment
      const env = {
        ...process.env,
        ...(service.env || {}),
      };

      // Create log stream
      const logStream = fs.createWriteStream(service.logFile!, { flags: 'a' });

      // Spawn process
      const child = childProcess.spawn(cmd, args, {
        cwd: service.workingDir,
        env,
        detached: true, // Run in background
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Pipe output to log file
      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      // Log start
      logStream.write(`\n[${new Date().toISOString()}] Service started (PID: ${child.pid})\n`);

      // Update service with PID
      this.ceoMemory.updateService(service.id, {
        pid: child.pid,
        status: 'running',
      });

      // Handle process exit
      child.on('exit', async (code, signal) => {
        logStream.write(`\n[${new Date().toISOString()}] Process exited (code: ${code}, signal: ${signal})\n`);
        logStream.end();

        const currentService = this.ceoMemory.getService(service.id);
        if (!currentService) return;

        if (currentService.status === 'running') {
          // Unexpected crash
          this.ceoMemory.updateService(service.id, { status: 'crashed' });
          
          await this.dailyLog.log({
            timestamp: new Date(),
            type: 'service_event',
            actor: 'genieceo',
            content: `Service "${service.name}" crashed (exit code: ${code})`,
            metadata: { serviceId: service.id, exitCode: code },
          });

          // Auto-restart if enabled
          if (currentService.autoRestart && (currentService.restartCount || 0) < 5) {
            console.log(`Auto-restarting service ${service.id}...`);
            setTimeout(() => this.restartService(service.id), 5000);
          }
        }
      });

      child.on('error', async (error) => {
        logStream.write(`\n[${new Date().toISOString()}] Error: ${error.message}\n`);
        logStream.end();

        this.ceoMemory.updateService(service.id, { status: 'crashed' });
        
        await this.dailyLog.log({
          timestamp: new Date(),
          type: 'service_event',
          actor: 'genieceo',
          content: `Service "${service.name}" error: ${error.message}`,
          metadata: { serviceId: service.id, error: error.message },
        });
      });

      // Detach so it keeps running
      child.unref();

    } catch (error) {
      throw new Error(`Failed to spawn process: ${error}`);
    }
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Check if a service is healthy
   */
  async checkHealth(id: string): Promise<boolean> {
    const service = this.ceoMemory.getService(id);
    
    if (!service) return false;
    if (service.status !== 'running') return false;
    if (!service.pid) return false;

    // Check if process is alive
    try {
      process.kill(service.pid, 0); // Signal 0 just checks if process exists
    } catch {
      // Process is dead
      this.ceoMemory.updateService(id, { status: 'crashed' });
      return false;
    }

    // HTTP health check if URL provided
    if (service.healthCheckUrl) {
      try {
        const healthy = await this.httpHealthCheck(service.healthCheckUrl);
        return healthy;
      } catch {
        return false;
      }
    }

    // Process is alive
    return true;
  }

  /**
   * HTTP health check
   */
  private async httpHealthCheck(url: string, timeout: number = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Monitor all services (background task)
   */
  async monitorServices(): Promise<void> {
    const services = this.ceoMemory.getRunningServices();
    
    for (const service of services) {
      const healthy = await this.checkHealth(service.id);
      
      if (!healthy && service.status === 'running') {
        // Service became unhealthy
        this.ceoMemory.updateService(service.id, { status: 'crashed' });
        
        await this.dailyLog.log({
          timestamp: new Date(),
          type: 'service_event',
          actor: 'genieceo',
          content: `Service "${service.name}" became unhealthy`,
          metadata: { serviceId: service.id },
        });
      }
    }
  }

  /**
   * Start background monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    this.monitorInterval = setInterval(() => {
      this.monitorServices().catch(error => {
        console.error('Service monitoring error:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  // ============================================================================
  // Debugging & Logs
  // ============================================================================

  /**
   * Get service logs
   */
  async getServiceLogs(id: string, lines: number = 50): Promise<string> {
    const service = this.ceoMemory.getService(id);
    
    if (!service || !service.logFile) {
      throw new Error(`Service ${id} not found or has no log file`);
    }

    try {
      const content = await readFile(service.logFile, 'utf-8');
      const allLines = content.split('\n');
      const recentLines = allLines.slice(-lines);
      return recentLines.join('\n');
    } catch (error) {
      return `Failed to read logs: ${error}`;
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  getService(id: string): ServiceProcess | undefined {
    return this.ceoMemory.getService(id);
  }

  getAllServices(): ServiceProcess[] {
    return this.ceoMemory.getServices();
  }

  getRunningServices(): ServiceProcess[] {
    return this.ceoMemory.getRunningServices();
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private generateServiceId(name: string): string {
    const normalized = name.toLowerCase().replace(/\s+/g, '-');
    const random = Math.random().toString(36).slice(2, 6);
    return `${normalized}-${random}`;
  }
}
