import { describe, it, expect } from 'vitest';
import { CloudflareKVAdapter, createCloudflareKVPlugin } from '../plugins/store_cloudflare_kv.js';
import { CloudflareD1Adapter, createCloudflareD1Plugin } from '../plugins/store_cloudflare_d1.js';
import { SignedStorageAdapter } from '../core/signed_storage.js';

describe('Cloudflare Storage Plugins (KV & D1)', () => {
  describe('Cloudflare Workers KV Storage Adapter', () => {
    it('should perform get, set, delete, and list operations on KV', async () => {
      const kvStore = new Map<string, string>();
      const mockKV = {
        async get(key: string, type?: string) {
          const val = kvStore.get(key);
          if (!val) return null;
          return type === 'json' ? JSON.parse(val) : val;
        },
        async put(key: string, value: string, options?: any) {
          kvStore.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        },
        async delete(key: string) {
          kvStore.delete(key);
        },
        async list(options?: any) {
          const prefix = options?.prefix || '';
          const keys = Array.from(kvStore.keys())
            .filter((k) => k.startsWith(prefix))
            .map((name) => ({ name }));
          return { keys, list_complete: true };
        },
      };

      const plugin = createCloudflareKVPlugin({ kv: mockKV as any, prefix: 'jit:test:' });
      const adapter = plugin.storageAdapter!;

      // 1. set
      await adapter.set('order:1001', { total: 500, status: 'PAID' });

      // 2. get
      const retrieved = await adapter.get('order:1001');
      expect(retrieved).toEqual({ total: 500, status: 'PAID' });

      // 3. list
      const keys = await adapter.list!('order:');
      expect(keys).toContain('order:1001');

      // 4. delete
      const deleted = await adapter.delete('order:1001');
      expect(deleted).toBe(true);

      const afterDelete = await adapter.get('order:1001');
      expect(afterDelete).toBeNull();
    });

    it('should be wrapped by SignedStorageAdapter for anti-tampering verification', async () => {
      const kvStore = new Map<string, string>();
      const mockKV = {
        async get(key: string, type?: string) {
          const val = kvStore.get(key);
          if (!val) return null;
          return type === 'json' ? JSON.parse(val) : val;
        },
        async put(key: string, value: string) {
          kvStore.set(key, value);
        },
        async delete(key: string) {
          kvStore.delete(key);
        },
      };

      const baseAdapter = new CloudflareKVAdapter(mockKV as any, 'jit:kv:');
      const signedAdapter = new SignedStorageAdapter(baseAdapter, {
        secretKey: 'cf-kv-secret-12345',
        strict: true,
      });

      await signedAdapter.set('profile:user_1', { name: 'Alice', level: 9 });
      const verified = await signedAdapter.get('profile:user_1');
      expect(verified).toEqual({ name: 'Alice', level: 9 });

      // Simulate tampering in KV
      const rawStored = JSON.parse(kvStore.get('jit:kv:profile:user_1')!);
      rawStored.data.level = 999; // tampered!
      kvStore.set('jit:kv:profile:user_1', JSON.stringify(rawStored));

      // Retrieval should reject tampered data
      const tampered = await signedAdapter.get('profile:user_1');
      expect(tampered).toBeNull();
    });
  });

  describe('Cloudflare D1 Storage Adapter (Serverless SQLite)', () => {
    it('should perform get, set, delete, and list operations on D1', async () => {
      const sqliteRows = new Map<string, { value: string; expires_at: number | null }>();

      const mockDb = {
        async exec(sql: string) {
          return { success: true };
        },
        prepare(query: string) {
          let boundParams: any[] = [];
          return {
            bind(...params: any[]) {
              boundParams = params;
              return this;
            },
            async first() {
              if (query.includes('SELECT value')) {
                const key = boundParams[0];
                const row = sqliteRows.get(key);
                if (!row) return null;
                return { value: row.value, expires_at: row.expires_at };
              }
              return null;
            },
            async run() {
              if (query.includes('INSERT INTO')) {
                const [key, value, expires_at] = boundParams;
                sqliteRows.set(key, { value, expires_at });
                return { success: true };
              }
              if (query.includes('DELETE FROM')) {
                const key = boundParams[0];
                const deleted = sqliteRows.delete(key);
                return { success: deleted };
              }
              return { success: true };
            },
            async all() {
              const now = Date.now();
              const prefix = boundParams.length > 1 ? boundParams[1].replace(/%$/, '') : '';
              const results: Array<{ key: string }> = [];
              for (const [k, v] of sqliteRows.entries()) {
                if (v.expires_at && v.expires_at < now) continue;
                if (!prefix || k.startsWith(prefix)) {
                  results.push({ key: k });
                }
              }
              return { results, success: true };
            },
          };
        },
      };

      const plugin = createCloudflareD1Plugin({ db: mockDb as any });
      const adapter = plugin.storageAdapter!;

      await adapter.set('d1:user:123', { username: 'bob', role: 'admin' });
      const user = await adapter.get('d1:user:123');
      expect(user).toEqual({ username: 'bob', role: 'admin' });

      const keys = await adapter.list!('d1:user');
      expect(keys).toContain('d1:user:123');

      await adapter.delete('d1:user:123');
      const afterDelete = await adapter.get('d1:user:123');
      expect(afterDelete).toBeNull();
    });
  });
});
