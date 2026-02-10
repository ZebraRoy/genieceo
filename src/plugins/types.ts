import type { Message } from "@mariozechner/pi-ai";

import type { GatewayRouter } from "../gateway/router.js";
import type { Logger } from "../logging/logger.js";

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
  /**
   * Optional inbound attachments saved to disk (e.g. images, voice notes, videos, documents).
   * Channel plugins are responsible for downloading to a local path and populating this field.
   */
  attachments?: InboundAttachment[];
  raw?: any;
};

export type InboundAttachment = {
  /**
   * High-level type. Keep this coarse so channels can map their native media types.
   */
  kind: "image" | "audio" | "video" | "file";
  /**
   * Absolute path to the downloaded media file.
   */
  path: string;
  /**
   * Best-effort MIME type (if known).
   */
  mimeType?: string;
  /**
   * Original filename from the channel (if provided).
   */
  originalName?: string;
  /**
   * Best-effort size in bytes (if known).
   */
  sizeBytes?: number;
  /**
   * Channel-specific reference (e.g. Telegram file_id, Discord URL).
   */
  source?: Record<string, any>;
};

export type OutboundAttachment = {
  /**
   * Absolute path to a local file to upload to the channel.
   */
  path: string;
  /**
   * Best-effort MIME type (if known).
   */
  mimeType?: string;
  /**
   * Preferred filename to show to the user (if the channel supports it).
   */
  filename?: string;
};

export type OutboundMessage = {
  conversationKey: string;
  text: string;
  /**
   * Optional outbound attachments to upload to the user (e.g. files, images, audio).
   * Channel adapters should best-effort send them; if unsupported, they should error.
   */
  attachments?: OutboundAttachment[];
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
  /**
   * Optional logger. Built-in gateway passes one; external plugins may ignore it.
   */
  logger?: Logger;
};

export type ChannelPluginModule = {
  manifest: ChannelPluginManifest;
  createChannelAdapter: (ctx: ChannelPluginContext) => Promise<ChannelAdapter> | ChannelAdapter;
};

export type SessionMessage = Message;

