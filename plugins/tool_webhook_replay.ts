/**
 * JIT Protocol Synthesis Framework - Webhook Replay & Debugger Tool Plugin
 * 
 * Records recent webhook payloads (LINE, Stripe, Custom Webhooks) in memory
 * and enables 1-click replaying for local and staging debuggers.
 */

import crypto from 'crypto';
import { JITPlugin } from '../core/plugin.js';

export interface WebhookRecord {
  id: string;
  timestamp: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  rawBody: string;
  parsedBody?: any;
  responseStatus?: number;
}

export class WebhookRecorder {
  private records: WebhookRecord[] = [];
  private maxRecords: number;

  constructor(maxRecords = 50) {
    this.maxRecords = maxRecords;
  }

  /**
   * Record a webhook event
   */
  public record(entry: Omit<WebhookRecord, 'id' | 'timestamp'>): string {
    const id = `rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const fullEntry: WebhookRecord = {
      ...entry,
      id,
      timestamp: Date.now(),
    };

    this.records.unshift(fullEntry);
    if (this.records.length > this.maxRecords) {
      this.records.pop();
    }
    return id;
  }

  /**
   * Get record by ID
   */
  public get(id: string): WebhookRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  /**
   * List all stored webhook records
   */
  public list(): WebhookRecord[] {
    return [...this.records];
  }

  /**
   * Clear all records
   */
  public clear(): void {
    this.records = [];
  }

  /**
   * Replay a webhook record to a target endpoint
   */
  public async replay(
    id: string,
    targetUrl: string
  ): Promise<{ status: number; ok: boolean; responseBody: any }> {
    const record = this.get(id);
    if (!record) {
      throw new Error(`Webhook record '${id}' not found`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...record.headers,
      'X-JIT-Replay': 'true',
      'X-JIT-Original-ID': record.id,
    };

    // Remove host header to avoid SSL/SNI mismatch on replay
    delete headers['host'];
    delete headers['Host'];
    delete headers['content-length'];

    try {
      const res = await fetch(targetUrl, {
        method: record.method || 'POST',
        headers,
        body: record.rawBody,
      });

      let resBody: any;
      const text = await res.text();
      try {
        resBody = JSON.parse(text);
      } catch {
        resBody = text;
      }

      return {
        status: res.status,
        ok: res.ok,
        responseBody: resBody,
      };
    } catch (err: any) {
      return {
        status: 500,
        ok: false,
        responseBody: { error: err.message },
      };
    }
  }
}

/**
 * Factory for Webhook Replay Plugin
 */
export function createWebhookReplayPlugin(options: { maxRecords?: number } = {}): JITPlugin {
  const recorder = new WebhookRecorder(options.maxRecords ?? 50);

  return {
    name: 'tool-webhook-replay',
    version: '1.4.1',
    description: 'Webhook Traffic Recorder & Replay Debugger for JIT API',
    storageAdapter: undefined,
  };
}
