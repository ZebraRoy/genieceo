/**
 * Service Management Tools
 * Tools for starting, stopping, monitoring services
 */

import { z } from 'zod';
import { ToolRegistry } from './base';
import { ServiceManager } from '../agent/service/manager';
import { DailyLogSystem } from '../memory/daily-log';

export function registerServiceTools(
  registry: ToolRegistry,
  serviceManager: ServiceManager,
  dailyLog: DailyLogSystem
) {
  // Start service
  registry.register({
    name: 'startService',
    description: 'Start a long-running service (web server, API, webhook, daemon). The service will keep running in the background.',
    parameters: z.object({
      name: z.string().describe('Human-readable service name'),
      type: z.enum(['web-server', 'api', 'webhook', 'daemon', 'other']).describe('Type of service'),
      command: z.string().describe('Command to start the service (e.g., "node server.js", "npm start")'),
      workingDir: z.string().describe('Working directory for the service'),
      port: z.number().optional().describe('Port number (if applicable)'),
      healthCheckUrl: z.string().optional().describe('HTTP URL for health checks (e.g., "http://localhost:3000/health")'),
      autoRestart: z.boolean().optional().describe('Auto-restart on crash (default: true)'),
      env: z.record(z.string()).optional().describe('Environment variables'),
    }),
    async execute(params) {
      const service = await serviceManager.startService(params);
      
      await dailyLog.log({
        timestamp: new Date(),
        type: 'service_event',
        actor: 'genieceo',
        content: `Started ${params.type} "${params.name}" (${service.id}) on port ${params.port || 'N/A'}`,
        metadata: { serviceId: service.id, port: params.port },
      });
      
      return `✓ Service started successfully

Service ID: ${service.id}
Name: ${service.name}
Type: ${service.type}
PID: ${service.pid}
Port: ${service.port || 'N/A'}
Status: ${service.status}
Log file: ${service.logFile}
Auto-restart: ${service.autoRestart ? 'enabled' : 'disabled'}

The service is now running in the background.`;
    },
  });

  // Stop service
  registry.register({
    name: 'stopService',
    description: 'Stop a running service',
    parameters: z.object({
      id: z.string().describe('Service ID'),
    }),
    async execute(params) {
      const service = serviceManager.getService(params.id);
      if (!service) {
        return `❌ Service ${params.id} not found`;
      }
      
      await serviceManager.stopService(params.id);
      
      await dailyLog.log({
        timestamp: new Date(),
        type: 'service_event',
        actor: 'genieceo',
        content: `Stopped service "${service.name}" (${params.id})`,
        metadata: { serviceId: params.id },
      });
      
      return `✓ Service ${params.id} (${service.name}) stopped successfully`;
    },
  });

  // Restart service
  registry.register({
    name: 'restartService',
    description: 'Restart a service',
    parameters: z.object({
      id: z.string().describe('Service ID'),
    }),
    async execute(params) {
      const service = serviceManager.getService(params.id);
      if (!service) {
        return `❌ Service ${params.id} not found`;
      }
      
      await serviceManager.restartService(params.id);
      
      return `✓ Service ${params.id} (${service.name}) restarted successfully`;
    },
  });

  // List services
  registry.register({
    name: 'listServices',
    description: 'List all services (running and stopped)',
    parameters: z.object({
      statusFilter: z.enum(['all', 'running', 'stopped', 'crashed']).optional().describe('Filter by status'),
    }),
    async execute(params) {
      const allServices = serviceManager.getAllServices();
      
      let services = allServices;
      if (params.statusFilter && params.statusFilter !== 'all') {
        services = allServices.filter(s => s.status === params.statusFilter);
      }
      
      if (services.length === 0) {
        return params.statusFilter 
          ? `No services with status "${params.statusFilter}"`
          : 'No services registered';
      }

      const lines = services.map(s => {
        const status = s.status === 'running' ? '✓' : s.status === 'crashed' ? '❌' : '○';
        return `${status} ${s.id} (${s.name})
   Type: ${s.type}
   Status: ${s.status}
   ${s.port ? `Port: ${s.port}` : ''}
   ${s.pid ? `PID: ${s.pid}` : ''}
   Started: ${s.startedAt.toISOString()}
   ${s.autoRestart ? 'Auto-restart: enabled' : ''}
   ${s.restartCount ? `Restarts: ${s.restartCount}` : ''}`;
      });
      
      return `# Services (${services.length})\n\n${lines.join('\n\n')}`;
    },
  });

  // Check service health
  registry.register({
    name: 'checkServiceHealth',
    description: 'Check if a service is healthy',
    parameters: z.object({
      id: z.string().describe('Service ID'),
    }),
    async execute(params) {
      const service = serviceManager.getService(params.id);
      if (!service) {
        return `❌ Service ${params.id} not found`;
      }
      
      const healthy = await serviceManager.checkHealth(params.id);
      
      return healthy
        ? `✓ Service ${params.id} (${service.name}) is healthy\n\nStatus: ${service.status}\nPID: ${service.pid}\nPort: ${service.port || 'N/A'}`
        : `❌ Service ${params.id} (${service.name}) is unhealthy\n\nStatus: ${service.status}\nLast check failed. View logs for details.`;
    },
  });

  // View service logs
  registry.register({
    name: 'viewServiceLogs',
    description: 'View service logs for debugging',
    parameters: z.object({
      id: z.string().describe('Service ID'),
      lines: z.number().optional().describe('Number of lines to show (default: 50)'),
    }),
    async execute(params) {
      const service = serviceManager.getService(params.id);
      if (!service) {
        return `❌ Service ${params.id} not found`;
      }
      
      try {
        const logs = await serviceManager.getServiceLogs(params.id, params.lines || 50);
        return `# Logs for ${service.name} (${params.id})

Log file: ${service.logFile}

\`\`\`
${logs}
\`\`\``;
      } catch (error) {
        return `❌ Failed to read logs: ${error}`;
      }
    },
  });

  // Get service details
  registry.register({
    name: 'getServiceDetails',
    description: 'Get detailed information about a service',
    parameters: z.object({
      id: z.string().describe('Service ID'),
    }),
    async execute(params) {
      const service = serviceManager.getService(params.id);
      if (!service) {
        return `❌ Service ${params.id} not found`;
      }
      
      return `# Service Details

**ID**: ${service.id}
**Name**: ${service.name}
**Type**: ${service.type}
**Status**: ${service.status}

**Process**:
- PID: ${service.pid || 'N/A'}
- Command: ${service.command}
- Working Directory: ${service.workingDir}
- Port: ${service.port || 'N/A'}

**Lifecycle**:
- Started: ${service.startedAt.toISOString()}
${service.stoppedAt ? `- Stopped: ${service.stoppedAt.toISOString()}` : ''}
- Restart Count: ${service.restartCount || 0}
- Auto-restart: ${service.autoRestart ? 'enabled' : 'disabled'}

**Monitoring**:
${service.healthCheckUrl ? `- Health Check URL: ${service.healthCheckUrl}` : '- No health check configured'}
- Log File: ${service.logFile}

**Environment Variables**:
${service.env ? Object.entries(service.env).map(([k, v]) => `- ${k}=${v}`).join('\n') : '(None)'}`;
    },
  });
}
