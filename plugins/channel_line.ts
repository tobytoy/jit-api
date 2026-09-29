/**
 * JIT Protocol Synthesis Framework - LINE Bot Channel Plugin
 * 
 * Provides LINE Webhook signature verification, reply & push messaging,
 * and integration with JIT TicketStore.
 */

import crypto from 'crypto';
import { JITPlugin } from '../core/plugin.js';

export interface LineBotPluginOptions {
  channelSecret: string;
  channelAccessToken: string;
}

/**
 * Verify LINE webhook signature using HMAC-SHA256
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string
): boolean {
  if (!signature || !channelSecret) return false;
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

/**
 * Send reply message via LINE Messaging API
 */
export async function sendLineReply(
  replyToken: string,
  messages: Array<{ type: string; text?: string; [key: string]: any }>,
  channelAccessToken: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send push message to specific LINE User ID
 */
export async function sendLinePush(
  toUserId: string,
  messages: Array<{ type: string; text?: string; [key: string]: any }>,
  channelAccessToken: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ to: toUserId, messages }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Factory for LINE Bot Channel Plugin
 */
export function createLineBotPlugin(options: LineBotPluginOptions): JITPlugin {
  return {
    name: 'line-bot',
    version: '1.4.1',
    description: 'LINE Messaging API & Webhook Plugin for JIT',
  };
}
