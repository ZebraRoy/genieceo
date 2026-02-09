import { ensureWorkspace } from "../workspace/bootstrap.js";
import { getWorkspaceRoot } from "../workspace/paths.js";
import { loadConfig } from "../config/store.js";
import { listServices } from "../services/manager.js";

async function fetchHealth(url: string): Promise<{ ok: boolean; status: number; bodyText: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const text = await res.text().catch(() => "");
      return { ok: res.ok, status: res.status, bodyText: text };
    } finally {
      clearTimeout(t);
    }
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    return { ok: false, status: 0, bodyText: msg };
  }
}

export async function runStatus(opts?: { json?: boolean }): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);
  const config = await loadConfig(workspaceRoot);

  const host = config.gateway.host;
  const port = config.gateway.port;
  const healthUrl = `http://${host}:${port}/health`;

  const services = await listServices({ workspaceRoot });
  const health = await fetchHealth(healthUrl);

  if (opts?.json) {
    const payload = {
      ok: true,
      workspaceRoot,
      gateway: {
        host,
        port,
        healthUrl,
        reachable: health.ok,
        status: health.status,
        bodyText: health.bodyText,
      },
      services,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Gateway: ${host}:${port}`);
  console.log(`Health: ${healthUrl}`);
  if (health.ok) {
    console.log(`Gateway health: OK (${health.status})`);
  } else {
    console.log(`Gateway health: NOT OK (${health.status || "unreachable"})`);
  }

  if (services.length === 0) {
    console.log("Services: [none]");
    return;
  }

  console.log(`Services (${services.length}):`);
  for (const s of services) {
    console.log(`- ${s.name}: ${s.running ? `running (pid ${s.pid})` : "stopped"} — ${s.command}`);
  }
}

