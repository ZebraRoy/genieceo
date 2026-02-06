import http from "node:http";

import type { AddressInfo } from "node:net";

import type { GatewayRequest } from "./router.js";
import { GatewayRouter } from "./router.js";

function normalizeHeaders(h: http.IncomingHttpHeaders): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v as any;
  return out;
}

async function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error(`body too large (> ${maxBytes} bytes)`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startGatewayServer(opts: {
  host: string;
  port: number;
  router: GatewayRouter;
  maxBodyBytes?: number;
}): Promise<{ close: () => Promise<void>; address: AddressInfo | null }> {
  const maxBodyBytes = typeof opts.maxBodyBytes === "number" ? opts.maxBodyBytes : 1_000_000;

  const server = http.createServer(async (req, res) => {
    try {
      const method = String(req.method ?? "GET").toUpperCase();
      const url = String(req.url ?? "/");
      const headers = normalizeHeaders(req.headers);
      const bodyRaw = await readBody(req, maxBodyBytes).catch(() => "");

      let bodyJson: any = undefined;
      if (bodyRaw.trim()) {
        try {
          bodyJson = JSON.parse(bodyRaw);
        } catch {
          // ignore; plugins can parse raw if they want
        }
      }

      const gwReq: GatewayRequest = { method, url, headers, bodyRaw, bodyJson };
      const gwRes = await opts.router.handle(gwReq);

      res.statusCode = gwRes.status;
      const hdrs = gwRes.headers ?? {};
      for (const [k, v] of Object.entries(hdrs)) res.setHeader(k, v);
      if (!("content-type" in Object.fromEntries(Object.entries(hdrs).map(([k, v]) => [k.toLowerCase(), v])))) {
        res.setHeader("content-type", "text/plain; charset=utf-8");
      }
      res.end(gwRes.body ?? "");
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "internal_error", message: msg }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve());
  });

  const address = server.address();

  return {
    address: address && typeof address === "object" ? (address as AddressInfo) : null,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

