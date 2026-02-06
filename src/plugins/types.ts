import type { Message } from "@mariozechner/pi-ai";

import type { GatewayRouter } from "../gateway/router.js";

export type ChannelPluginManifest = {
  name: string; // folder name + stable id (e.g. "telegram", "line")
  type: "channel";
  entry: string; // relative path from plugin root (e.g. "./index.js")
  webhookPaths?: string[]; // optional metadata; gateway still trusts what plugin registers
  configKey: string; // where settings live in config.json (e.g. "channels.telegram")
  version?: string;
};

export type InboundMessage = {
  channel: string;
  /**
   * Stable key for queueing / serialization.
   * Example: "telegram:bot123:chat456"
   */
  conversationKey: string;
  /**
   * Filesystem path segments under ~/.genieceo/sessions/.
   * Example: ["telegram", "bot-123", "chat-456"]
   */
  conversationPathParts: string[];
  userId?: string;
  text: string;
  raw?: any;
};

export type OutboundMessage = {
  conversationKey: string;
  text: string;
};

export type ChannelAdapter = {
  name: string;
  /**
   * Register webhook routes (and/or start pollers).
   * This is called once at gateway startup.
   */
  registerRoutes: (router: GatewayRouter) => void | Promise<void>;
  /**
   * Send a message back to the channel.
   */
  send: (msg: OutboundMessage) => Promise<void>;
};

export type ChannelPluginContext = {
  workspaceRoot: string;
  config: any; // full config.json parsed (plugin reads configKey itself)
  /**
   * The gateway will inject a function to pass inbound events into the agent.
   */
  emitInbound: (msg: InboundMessage) => Promise<void>;
};

export type ChannelPluginModule = {
  manifest: ChannelPluginManifest;
  createChannelAdapter: (ctx: ChannelPluginContext) => Promise<ChannelAdapter> | ChannelAdapter;
};

export type SessionMessage = Message;

