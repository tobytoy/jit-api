/**
 * JIT Protocol Synthesis Framework - Discord Channel Plugin
 * 
 * Provides Discord Webhook integration, Rich Embed generation,
 * and JIT Declarative Notify dispatching.
 */

import { JITPlugin, JITRouteEvent } from '../core/plugin.js';
import { UpstreamClient } from '../core/upstream_client.js';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // e.g. 0x5865F2 (Blurple), 0x57F287 (Green), 0xED4245 (Red)
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordPluginOptions {
  webhookUrl?: string;
  defaultUsername?: string;
  notifyOnErrorOnly?: boolean;
}

/**
 * Dispatch message or embed to Discord Webhook
 */
export async function sendDiscordMessage(
  webhookUrl: string,
  payload: string | DiscordWebhookPayload
): Promise<boolean> {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;
  if (!UpstreamClient.isSafeUrl(url).safe) return false;

  const body = typeof payload === 'string' ? { content: payload } : payload;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send pre-formatted JIT Route Notification to Discord
 */
export async function sendDiscordRouteAlert(
  webhookUrl: string,
  event: {
    route: string;
    phase: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }
): Promise<boolean> {
  const color = event.success ? 0x57F287 : 0xED4245; // Green or Red
  const embed: DiscordEmbed = {
    title: `⚡ JIT Route Event: ${event.route}`,
    description: event.success
      ? `Successfully executed in **${event.durationMs.toFixed(1)}ms** (Phase: \`${event.phase}\`)`
      : `⚠️ Route failed: **${event.error || 'Internal Server Error'}**`,
    color,
    fields: [
      { name: 'Phase', value: `\`${event.phase}\``, inline: true },
      { name: 'Latency', value: `${event.durationMs.toFixed(1)} ms`, inline: true },
      { name: 'Status', value: event.success ? '✅ Success' : '❌ Failed', inline: true },
    ],
    footer: { text: 'JIT Protocol Synthesis Framework' },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordMessage(webhookUrl, {
    username: 'JIT Bot',
    embeds: [embed],
  });
}

/**
 * Factory for Discord Channel Plugin
 */
export function createDiscordPlugin(options: DiscordPluginOptions = {}): JITPlugin {
  const webhookUrl = options.webhookUrl || process.env.DISCORD_WEBHOOK_URL;

  return {
    name: 'channel-discord',
    version: '1.4.1',
    description: 'Discord Webhook & Rich Embed Notification Channel for JIT API',
    async onRouteExecuted(event: JITRouteEvent) {
      if (!webhookUrl) return;
      if (options.notifyOnErrorOnly && event.success) return;

      await sendDiscordRouteAlert(webhookUrl, {
        route: event.route,
        phase: event.phase,
        durationMs: event.durationMs,
        success: event.success,
      });
    },
  };
}
