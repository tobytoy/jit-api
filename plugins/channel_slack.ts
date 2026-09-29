/**
 * JIT Protocol Synthesis Framework - Slack Channel Plugin
 * 
 * Provides Slack Webhook and Block Kit formatting for team alerts,
 * ticket triage notifications, and drift approval requests.
 */

import { JITPlugin, JITRouteEvent } from '../core/plugin.js';

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: any[];
  accessory?: any;
}

export interface SlackWebhookPayload {
  text?: string;
  blocks?: SlackBlock[];
  username?: string;
  icon_emoji?: string;
}

export interface SlackPluginOptions {
  webhookUrl?: string;
  channelName?: string;
  notifyOnErrorOnly?: boolean;
}

/**
 * Dispatch message to Slack via Incoming Webhook
 */
export async function sendSlackMessage(
  webhookUrl: string,
  payload: string | SlackWebhookPayload
): Promise<boolean> {
  const url = webhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;

  const body = typeof payload === 'string' ? { text: payload } : payload;

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
 * Send Block Kit formatted JIT Route Event to Slack
 */
export async function sendSlackRouteAlert(
  webhookUrl: string,
  event: {
    route: string;
    phase: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }
): Promise<boolean> {
  const statusEmoji = event.success ? ':white_check_mark:' : ':x:';
  const payload: SlackWebhookPayload = {
    text: `${statusEmoji} JIT Event: ${event.route}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `⚡ JIT Route Event: ${event.route}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Phase:*\n\`${event.phase}\`` },
          { type: 'mrkdwn', text: `*Latency:*\n${event.durationMs.toFixed(1)} ms` },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${event.success ? 'Success' : `Failed (${event.error || 'Error'})`}`,
          },
          {
            type: 'mrkdwn',
            text: `*Timestamp:*\n<!date^${Math.floor(Date.now() / 1000)}^{date_num} {time_secs}|${new Date().toISOString()}>`,
          },
        ],
      },
    ],
  };

  return sendSlackMessage(webhookUrl, payload);
}

/**
 * Factory for Slack Channel Plugin
 */
export function createSlackPlugin(options: SlackPluginOptions = {}): JITPlugin {
  const webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL;

  return {
    name: 'channel-slack',
    version: '1.4.1',
    description: 'Slack Webhook & Block Kit Notification Channel for JIT API',
    async onRouteExecuted(event: JITRouteEvent) {
      if (!webhookUrl) return;
      if (options.notifyOnErrorOnly && event.success) return;

      await sendSlackRouteAlert(webhookUrl, {
        route: event.route,
        phase: event.phase,
        durationMs: event.durationMs,
        success: event.success,
      });
    },
  };
}
