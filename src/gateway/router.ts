import { URL } from "node:url";

export type GatewayRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyRaw: string;
  bodyJson?: any;
};

export type GatewayResponse = {
  status: number;
  headers?: Record<string, string>;
  body: string;
};

export type GatewayHandler = (req: GatewayRequest) => Promise<GatewayResponse>;

type RouteKey = `${string} ${string}`; // METHOD path

export class GatewayRouter {
  private routes = new Map<RouteKey, GatewayHandler>();

  get(pathname: string, handler: GatewayHandler): void {
    this.routes.set(`GET ${pathname}`, handler);
  }

  post(pathname: string, handler: GatewayHandler): void {
    this.routes.set(`POST ${pathname}`, handler);
  }

  async handle(req: GatewayRequest): Promise<GatewayResponse> {
    const u = new URL(req.url, "http://localhost");
    const pathname = u.pathname;
    const key = `${req.method.toUpperCase()} ${pathname}` as RouteKey;
    const handler = this.routes.get(key);
    if (!handler) {
      return {
        status: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not_found", method: req.method, path: pathname }),
      };
    }
    return await handler(req);
  }
}

