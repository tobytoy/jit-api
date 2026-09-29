/**
 * JIT Protocol Synthesis Framework - Upstash Serverless Redis Storage Adapter
 * 
 * Provides HTTP-based Redis persistence for Cloudflare Workers, Vercel Edge,
 * and Serverless environments with zero TCP connection-pooling overhead.
 */

import { JITStorageAdapter, MemoryStorageAdapter, JITPlugin } from '../core/plugin.js';
import { SignedStorageAdapter } from '../core/signed_storage.js';

export interface UpstashRedisOptions {
  /**
   * Upstash REST URL (e.g. https://xxxx.upstash.io)
   */
  url?: string;

  /**
   * Upstash REST Token
   */
  token?: string;

  /**
   * Key prefix (defaults to 'jit:')
   */
  keyPrefix?: string;

  /**
   * HMAC-SHA256 Signing secret to protect cached schemas & entries against poisoning
   */
  signingSecret?: string;
}

export class UpstashRedisStorageAdapter implements JITStorageAdapter {
  public name = 'upstash-redis';
  private url?: string;
  private token?: string;
  private keyPrefix: string;
  private memoryFallback: MemoryStorageAdapter;

  constructor(options: UpstashRedisOptions = {}) {
    this.url = options.url || process.env.UPSTASH_REDIS_REST_URL;
    this.token = options.token || process.env.UPSTASH_REDIS_REST_TOKEN;
    this.keyPrefix = options.keyPrefix ?? 'jit:';
    this.memoryFallback = new MemoryStorageAdapter();
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async command(...args: any[]): Promise<any> {
    if (!this.url || !this.token) {
      throw new Error('Missing Upstash URL or Token');
    }

    const res = await fetch(`${this.url.replace(/\/$/, '')}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!res.ok) {
      throw new Error(`Upstash command failed with status ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const raw = await this.command('GET', this.fullKey(key));
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as T;
      }
    } catch {
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.memoryFallback.set(key, value, ttlMs);

    try {
      const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (ttlMs) {
        await this.command('SET', this.fullKey(key), strVal, 'PX', ttlMs);
      } else {
        await this.command('SET', this.fullKey(key), strVal);
      }
    } catch {
      // Handled by memory fallback
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.memoryFallback.delete(key);
    try {
      const res = await this.command('DEL', this.fullKey(key));
      return Boolean(res);
    } catch {
      return true;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      const pattern = prefix ? `${this.fullKey(prefix)}*` : `${this.keyPrefix}*`;
      const keys: string[] = await this.command('KEYS', pattern);
      if (Array.isArray(keys)) {
        return keys.map((k) => k.replace(this.keyPrefix, ''));
      }
      return [];
    } catch {
      return this.memoryFallback.list(prefix);
    }
  }
}

/**
 * Factory for Upstash Serverless Redis Plugin
 */
export function createUpstashRedisPlugin(options: UpstashRedisOptions = {}): JITPlugin {
  const baseAdapter = new UpstashRedisStorageAdapter(options);
  const secret = options.signingSecret || process.env.JIT_STORAGE_SIGNING_SECRET;
  const storageAdapter = secret
    ? new SignedStorageAdapter(baseAdapter, { secretKey: secret })
    : baseAdapter;

  return {
    name: 'store-upstash-redis',
    version: '1.4.1',
    description: 'Upstash Serverless Redis REST Storage Plugin for JIT API',
    storageAdapter,
  };
}
