/**
 * JIT Protocol Synthesis Framework - Cloudflare D1 (Serverless SQLite) Storage Adapter
 * 
 * Provides relational & key-value hybrid storage adapter for Cloudflare D1.
 * Automatically provisions the key-value schema on first access.
 */

import { JITPlugin, JITStorageAdapter } from '../core/plugin.js';

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<{ success: boolean; error?: string }>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<any>;
}

export interface CloudflareD1Options {
  db: D1Database;
  tableName?: string;
  autoMigrate?: boolean;
}

export class CloudflareD1Adapter implements JITStorageAdapter {
  public name = 'cloudflare-d1';
  private db: D1Database;
  private tableName: string;
  private migrated = false;
  private autoMigrate: boolean;

  constructor(db: D1Database, tableName = 'jit_storage', autoMigrate = true) {
    this.db = db;
    this.tableName = tableName;
    this.autoMigrate = autoMigrate;
  }

  private async ensureTable(): Promise<void> {
    if (this.migrated || !this.autoMigrate) return;
    try {
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires ON ${this.tableName}(expires_at);
      `);
      this.migrated = true;
    } catch (err: any) {
      // Table might already exist or read-only, proceed gracefully
      this.migrated = true;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.ensureTable();
    try {
      const now = Date.now();
      const row = await this.db
        .prepare(`SELECT value, expires_at FROM ${this.tableName} WHERE key = ?`)
        .bind(key)
        .first<{ value: string; expires_at?: number }>();

      if (!row) return null;
      if (row.expires_at && row.expires_at < now) {
        // Expired, delete asynchronously
        this.delete(key).catch(() => {});
        return null;
      }
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.ensureTable();
    try {
      const expiresAt = ttlMs ? Date.now() + ttlMs : null;
      const jsonStr = JSON.stringify(value);
      await this.db
        .prepare(
          `INSERT INTO ${this.tableName} (key, value, expires_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
        )
        .bind(key, jsonStr, expiresAt)
        .run();
    } catch (err: any) {
      console.error(`[CloudflareD1Adapter] Set failed for key '${key}':`, err.message);
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureTable();
    try {
      const res = await this.db
        .prepare(`DELETE FROM ${this.tableName} WHERE key = ?`)
        .bind(key)
        .run();
      return res.success;
    } catch {
      return false;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    await this.ensureTable();
    try {
      const now = Date.now();
      let query = `SELECT key FROM ${this.tableName} WHERE (expires_at IS NULL OR expires_at >= ?)`;
      const params: any[] = [now];

      if (prefix) {
        query += ` AND key LIKE ?`;
        params.push(`${prefix}%`);
      }

      const res = await this.db.prepare(query).bind(...params).all<{ key: string }>();
      return (res.results || []).map((r) => r.key);
    } catch {
      return [];
    }
  }
}

export function createCloudflareD1Plugin(options: CloudflareD1Options): JITPlugin {
  const adapter = new CloudflareD1Adapter(options.db, options.tableName, options.autoMigrate);
  return {
    name: 'store-cloudflare-d1',
    version: '1.5.0',
    description: 'Cloudflare D1 SQLite storage adapter for relational edge persistence',
    storageAdapter: adapter,
  };
}
