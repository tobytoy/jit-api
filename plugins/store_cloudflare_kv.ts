/**
 * JIT Protocol Synthesis Framework - Cloudflare Workers KV Storage Adapter
 * 
 * Provides global, low-latency key-value storage adapter for Cloudflare Workers KV.
 * Fully compatible with JIT signed storage and tamper-proofing envelopes.
 */

import { JITPlugin, JITStorageAdapter } from '../core/plugin.js';

export interface CloudflareKVNamespace {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface CloudflareKVOptions {
  kv: CloudflareKVNamespace;
  prefix?: string;
  defaultTtlSeconds?: number;
}

export class CloudflareKVAdapter implements JITStorageAdapter {
  public name = 'cloudflare-kv';
  private kv: CloudflareKVNamespace;
  private prefix: string;
  private defaultTtlSeconds?: number;

  constructor(kv: CloudflareKVNamespace, prefix = 'jit:', defaultTtlSeconds?: number) {
    this.kv = kv;
    this.prefix = prefix;
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = `${this.prefix}${key}`;
      const raw = await this.kv.get(fullKey, 'json');
      return raw as T;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    const ttlSeconds = ttlMs
      ? Math.max(60, Math.ceil(ttlMs / 1000))
      : this.defaultTtlSeconds
      ? Math.max(60, this.defaultTtlSeconds)
      : undefined;

    const options = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
    await this.kv.put(fullKey, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = `${this.prefix}${key}`;
      await this.kv.delete(fullKey);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      const lookupPrefix = `${this.prefix}${prefix || ''}`;
      const res = await this.kv.list({ prefix: lookupPrefix });
      return res.keys.map((k) => k.name.slice(this.prefix.length));
    } catch {
      return [];
    }
  }
}

export function createCloudflareKVPlugin(options: CloudflareKVOptions): JITPlugin {
  const adapter = new CloudflareKVAdapter(options.kv, options.prefix, options.defaultTtlSeconds);
  return {
    name: 'store-cloudflare-kv',
    version: '1.5.0',
    description: 'Cloudflare Workers KV storage adapter for global edge persistence',
    storageAdapter: adapter,
  };
}
