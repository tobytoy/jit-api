/**
 * JIT Protocol Synthesis Framework - Supabase Storage Adapter
 * 
 * Persists JIT Tickets, Tenant data, and Schema snapshots to Supabase Postgres.
 */

import { JITStorageAdapter, MemoryStorageAdapter } from '../core/plugin.js';

export interface SupabaseStorageOptions {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string;
  enableMemoryFallback?: boolean;
}

export class SupabaseStorageAdapter implements JITStorageAdapter {
  public name = 'supabase';
  private supabaseUrl: string;
  private supabaseKey: string;
  private tableName: string;
  private memoryFallback: MemoryStorageAdapter;

  constructor(options: SupabaseStorageOptions) {
    this.supabaseUrl = options.supabaseUrl.replace(/\/$/, '');
    this.supabaseKey = options.supabaseKey;
    this.tableName = options.tableName || 'jit_kv_store';
    this.memoryFallback = new MemoryStorageAdapter();
  }

  private get headers(): Record<string, string> {
    return {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const url = `${this.supabaseUrl}/rest/v1/${this.tableName}?key=eq.${encodeURIComponent(key)}&select=value,expires_at`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.get<T>(key);
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }
      const row = data[0];
      if (row.expires_at && Date.now() > new Date(row.expires_at).getTime()) {
        await this.delete(key);
        return null;
      }
      return row.value as T;
    } catch {
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null;
    await this.memoryFallback.set(key, value, ttlMs);

    try {
      const url = `${this.supabaseUrl}/rest/v1/${this.tableName}`;
      await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key,
          value,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch {
      // Memory fallback handles the state
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.memoryFallback.delete(key);
    try {
      const url = `${this.supabaseUrl}/rest/v1/${this.tableName}?key=eq.${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.headers,
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      let url = `${this.supabaseUrl}/rest/v1/${this.tableName}?select=key`;
      if (prefix) {
        url += `&key=like.${encodeURIComponent(prefix)}*`;
      }
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.list(prefix);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((r: any) => r.key);
      }
      return [];
    } catch {
      return this.memoryFallback.list(prefix);
    }
  }
}
