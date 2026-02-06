/**
 * Webhook Server for GenieCEO
 * 
 * Provides HTTP endpoints for external integrations:
 * - POST /webhook - Execute tasks via webhook
 * - POST /chat - Interactive chat with session management
 * - GET /health - Health check
 * - GET /status - Agent status and statistics
 */

import * as http from 'http';
import { URL } from 'url';
import type { Config } from '../types';
import type { AgentLoop } from '../agent/loop';

interface WebhookRequest {
  message: string;
  source?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  async?: boolean;
  callbackUrl?: string;
  stream?: boolean;
}

interface WebhookResponse {
  success: boolean;
  response?: string;
  error?: string;
  timestamp: string;
  taskId?: string;
}

interface SessionData {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastActivity: Date;
}

export class WebhookServer {
  private server?: http.Server;
  private agent: AgentLoop;
  private config: Config;
  private authToken?: string;
  private sessions: Map<string, SessionData> = new Map();
  private requestCount: Map<string, { count: number; resetAt: Date }> = new Map();
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    startTime: new Date(),
  };

  constructor(agent: AgentLoop, config: Config, authToken?: string) {
    this.agent = agent;
    this.config = config;
    this.authToken = authToken;

    // Clean up old sessions every hour
    setInterval(() => this.cleanupSessions(), 60 * 60 * 1000);
  }

  /**
   * Start the webhook server
   */
  async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(error => {
          console.error('Request handler error:', error);
          this.sendError(res, 500, 'Internal server error');
        });
      });

      this.server.listen(port, () => {
        console.log(`\n🚀 GenieCEO webhook server running on http://localhost:${port}`);
        console.log(`\nAvailable endpoints:`);
        console.log(`  POST /webhook - Execute tasks`);
        console.log(`  POST /chat    - Interactive chat`);
        console.log(`  GET  /health  - Health check`);
        console.log(`  GET  /status  - Server statistics\n`);
        if (this.authToken) {
          console.log(`🔒 Authentication enabled (Authorization: Bearer token)\n`);
        }
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // Authentication check (skip for health endpoint)
    if (path !== '/health' && this.authToken) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      if (token !== this.authToken) {
        this.sendError(res, 401, 'Unauthorized');
        return;
      }
    }

    // Rate limiting
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!this.checkRateLimit(clientIp)) {
      this.sendError(res, 429, 'Too many requests');
      return;
    }

    // Route requests
    try {
      this.stats.totalRequests++;

      switch (path) {
        case '/webhook':
          if (req.method === 'POST') {
            await this.handleWebhook(req, res);
          } else {
            this.sendError(res, 405, 'Method not allowed');
          }
          break;

        case '/chat':
          if (req.method === 'POST') {
            await this.handleChat(req, res);
          } else {
            this.sendError(res, 405, 'Method not allowed');
          }
          break;

        case '/health':
          this.handleHealth(res);
          break;

        case '/status':
          this.handleStatus(res);
          break;

        default:
          this.sendError(res, 404, 'Not found');
      }
    } catch (error) {
      this.stats.failedRequests++;
      console.error('Request error:', error);
      this.sendError(res, 500, error instanceof Error ? error.message : 'Internal error');
    }
  }

  /**
   * Handle /webhook endpoint
   */
  private async handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const request: WebhookRequest = body;

    // Validate request
    if (!request.message) {
      this.sendError(res, 400, 'Missing required field: message');
      return;
    }

    console.log(`[Webhook] Received from ${request.source || 'unknown'}: ${request.message.substring(0, 50)}...`);

    try {
      // Execute task
      const response = await this.agent.run(request.message);
      
      this.stats.successfulRequests++;

      const webhookResponse: WebhookResponse = {
        success: true,
        response,
        timestamp: new Date().toISOString(),
      };

      this.sendJSON(res, 200, webhookResponse);

      // If callback URL provided, send result there too
      if (request.callbackUrl) {
        this.sendCallback(request.callbackUrl, webhookResponse).catch(err => {
          console.error('Callback error:', err);
        });
      }
    } catch (error) {
      this.stats.failedRequests++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] Error:', errorMessage);
      
      this.sendJSON(res, 500, {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle /chat endpoint (with session management)
   */
  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const request: WebhookRequest = body;

    if (!request.message) {
      this.sendError(res, 400, 'Missing required field: message');
      return;
    }

    const sessionId = request.sessionId || request.userId || 'default';
    
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        history: [],
        lastActivity: new Date(),
      };
      this.sessions.set(sessionId, session);
    }

    session.lastActivity = new Date();

    console.log(`[Chat] Session ${sessionId}: ${request.message.substring(0, 50)}...`);

    try {
      // Execute with history
      const result = await (this.agent as any).runWithHistory(request.message, session.history);
      
      // Update session history
      session.history = result.updatedHistory;

      this.stats.successfulRequests++;

      this.sendJSON(res, 200, {
        success: true,
        response: result.response,
        timestamp: new Date().toISOString(),
        sessionId,
      });
    } catch (error) {
      this.stats.failedRequests++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Chat] Error:', errorMessage);
      
      this.sendJSON(res, 500, {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle /health endpoint
   */
  private handleHealth(res: http.ServerResponse): void {
    this.sendJSON(res, 200, {
      status: 'healthy',
      uptime: Date.now() - this.stats.startTime.getTime(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle /status endpoint
   */
  private handleStatus(res: http.ServerResponse): void {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    this.sendJSON(res, 200, {
      status: 'running',
      uptime,
      uptimeHuman: this.formatUptime(uptime),
      stats: {
        totalRequests: this.stats.totalRequests,
        successfulRequests: this.stats.successfulRequests,
        failedRequests: this.stats.failedRequests,
        successRate: this.stats.totalRequests > 0
          ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
          : 'N/A',
      },
      sessions: {
        active: this.sessions.size,
        totalMessages: Array.from(this.sessions.values())
          .reduce((sum, s) => sum + s.history.length, 0),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Rate limiting check (100 requests per 15 minutes per IP)
   */
  private checkRateLimit(clientIp: string): boolean {
    const now = new Date();
    const limit = this.requestCount.get(clientIp);

    if (!limit || now > limit.resetAt) {
      // Reset or create new limit
      this.requestCount.set(clientIp, {
        count: 1,
        resetAt: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes
      });
      return true;
    }

    if (limit.count >= 100) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Clean up old sessions (inactive for > 1 hour)
   */
  private cleanupSessions(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Send callback to external URL
   */
  private async sendCallback(url: string, data: any): Promise<void> {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Callback failed with status ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Parse request body
   */
  private async parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJSON(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  private sendError(res: http.ServerResponse, status: number, message: string): void {
    this.sendJSON(res, status, {
      error: message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
