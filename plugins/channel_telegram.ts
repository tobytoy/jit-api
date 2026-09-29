/**
 * JIT Protocol Synthesis Framework - Telegram Bot Channel Plugin
 * 
 * Provides Telegram Bot API integration for real-time alerting,
 * route execution notifications, and interactive updates.
 */

import { JITPlugin, JITRouteEvent } from '../core/plugin.js';

export interface TelegramSendOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export interface TelegramPluginOptions {
  botToken?: string;
  defaultChatId?: string | number;
  notifyOnErrorOnly?: boolean;
}

/**
 * Dispatch message to Telegram chat via Bot API
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  botToken?: string,
  options: TelegramSendOptions = {}
): Promise<boolean> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode ?? 'HTML',
        disable_web_page_preview: options.disableWebPagePreview ?? true,
        disable_notification: options.disableNotification ?? false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send pre-formatted JIT Route Notification to Telegram
 */
export async function sendTelegramRouteAlert(
  chatId: string | number,
  botToken: string,
  event: {
    route: string;
    phase: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }
): Promise<boolean> {
  const statusEmoji = event.success ? '🟢' : '🔴';
  const html = `
<b>${statusEmoji} JIT Route Event: <code>${event.route}</code></b>
<b>Phase:</b> <code>${event.phase}</code>
<b>Latency:</b> ${event.durationMs.toFixed(1)} ms
<b>Status:</b> ${event.success ? 'Success' : `Failed (${event.error || 'Error'})`}
<i>JIT Protocol Synthesis Framework</i>
`.trim();

  return sendTelegramMessage(chatId, html, botToken, { parseMode: 'HTML' });
}

/**
 * Factory for Telegram Channel Plugin
 */
export function createTelegramPlugin(options: TelegramPluginOptions = {}): JITPlugin {
  const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.defaultChatId || process.env.TELEGRAM_CHAT_ID;

  return {
    name: 'channel-telegram',
    version: '1.4.1',
    description: 'Telegram Bot Notification Channel for JIT API',
    async onRouteExecuted(event: JITRouteEvent) {
      if (!token || !chatId) return;
      if (options.notifyOnErrorOnly && event.success) return;

      await sendTelegramRouteAlert(chatId, token, {
        route: event.route,
        phase: event.phase,
        durationMs: event.durationMs,
        success: event.success,
      });
    },
  };
}
