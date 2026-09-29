import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager, MemoryStorageAdapter } from '../core/plugin.js';
import { createSupabaseAuthPlugin } from '../plugins/auth_supabase.js';
import { createLineAuthPlugin } from '../plugins/auth_line.js';
import { SupabaseStorageAdapter } from '../plugins/store_supabase.js';
import { FirestoreStorageAdapter } from '../plugins/store_firestore.js';
import { verifyLineSignature } from '../plugins/channel_line.js';
import crypto from 'crypto';

describe('JIT Plugins Suite', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
  });

  describe('PluginManager Lifecycle', () => {
    it('should register, list, and unregister plugins', () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
      };

      pluginManager.register(mockPlugin);
      expect(pluginManager.get('test-plugin')).toBeDefined();
      expect(pluginManager.list().length).toBe(1);

      const removed = pluginManager.unregister('test-plugin');
      expect(removed).toBe(true);
      expect(pluginManager.list().length).toBe(0);
    });

    it('should allow custom storage adapter via plugin', async () => {
      const memoryAdapter = new MemoryStorageAdapter();
      await memoryAdapter.set('test_key', { foo: 'bar' });

      pluginManager.setStorageAdapter(memoryAdapter);
      const val = await pluginManager.getStorageAdapter().get('test_key');
      expect(val).toEqual({ foo: 'bar' });
    });
  });

  describe('SupabaseAuthPlugin', () => {
    const supabasePlugin = createSupabaseAuthPlugin({ requiredRole: 'admin' });

    function makeJwt(payload: any): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.mock_signature`;
    }

    it('should validate valid Supabase JWT and extract user', async () => {
      const jwt = makeJwt({
        sub: 'usr_123',
        email: 'dev@example.com',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await supabasePlugin.authValidator!(
        `Bearer ${jwt}`,
        { type: 'supabase' }
      );

      expect(res).not.toBeNull();
      expect(res?.authenticated).toBe(true);
      expect(res?.user?.id).toBe('usr_123');
      expect(res?.user?.email).toBe('dev@example.com');
      expect(res?.role).toBe('admin');
    });

    it('should reject expired Supabase JWT', async () => {
      const jwt = makeJwt({
        sub: 'usr_123',
        exp: Math.floor(Date.now() / 1000) - 100, // expired
      });

      const res = await supabasePlugin.authValidator!(
        `Bearer ${jwt}`,
        { type: 'supabase' }
      );

      expect(res?.authenticated).toBe(false);
      expect(res?.error).toContain('expired');
    });

    it('should reject unauthorized role if requiredRole is not met', async () => {
      const jwt = makeJwt({
        sub: 'usr_123',
        role: 'authenticated', // but requiredRole is admin
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await supabasePlugin.authValidator!(
        `Bearer ${jwt}`,
        { type: 'supabase' }
      );

      expect(res?.authenticated).toBe(false);
      expect(res?.error).toContain('Forbidden');
    });
  });

  describe('LineAuthPlugin', () => {
    const linePlugin = createLineAuthPlugin({
      channelId: '1234567890',
      allowMockTokens: true,
    });

    function makeLineJwt(payload: any): string {
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.mock_signature`;
    }

    it('should validate valid LINE ID token', async () => {
      const jwt = makeLineJwt({
        iss: 'https://access.line.me',
        sub: 'U9988776655',
        aud: '1234567890',
        name: 'Toby Wang',
        picture: 'https://profile.line-scdn.net/avatar.jpg',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await linePlugin.authValidator!(
        `Bearer ${jwt}`,
        { type: 'line' }
      );

      expect(res?.authenticated).toBe(true);
      expect(res?.user?.id).toBe('U9988776655');
      expect(res?.user?.displayName).toBe('Toby Wang');
    });

    it('should reject token with mismatched channelId (aud)', async () => {
      const jwt = makeLineJwt({
        iss: 'https://access.line.me',
        sub: 'U9988776655',
        aud: 'WRONG_CHANNEL',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await linePlugin.authValidator!(
        `Bearer ${jwt}`,
        { type: 'line' }
      );

      expect(res?.authenticated).toBe(false);
      expect(res?.error).toContain('Channel ID mismatch');
    });

    it('should support mock LINE token in dev/test', async () => {
      const res = await linePlugin.authValidator!(
        'Bearer mock_line_U_MOCK_USER_1',
        { type: 'line' }
      );

      expect(res?.authenticated).toBe(true);
      expect(res?.user?.id).toBe('U_MOCK_USER_1');
    });
  });

  describe('Storage Adapters (Offline Fallback)', () => {
    it('should persist and retrieve items using SupabaseStorageAdapter memory fallback', async () => {
      const adapter = new SupabaseStorageAdapter({
        supabaseUrl: 'https://invalid-subdomain.supabase.co',
        supabaseKey: 'dummy-key',
      });

      await adapter.set('session:123', { token: 'abc', role: 'admin' }, 5000);
      const res = await adapter.get('session:123');
      expect(res).toEqual({ token: 'abc', role: 'admin' });

      await adapter.delete('session:123');
      const deleted = await adapter.get('session:123');
      expect(deleted).toBeNull();
    });

    it('should persist and retrieve items using FirestoreStorageAdapter memory fallback', async () => {
      const adapter = new FirestoreStorageAdapter({
        projectId: 'test-project',
      });

      await adapter.set('ticket:#TKT-001', { title: 'Add Line Pay' });
      const res = await adapter.get('ticket:#TKT-001');
      expect(res).toEqual({ title: 'Add Line Pay' });
    });
  });

  describe('LINE Channel Utilities', () => {
    it('should correctly verify LINE HMAC-SHA256 signature', () => {
      const secret = 'test_channel_secret_key_123';
      const body = JSON.stringify({ events: [{ type: 'message' }] });
      const validSignature = crypto.createHmac('sha256', secret).update(body).digest('base64');

      expect(verifyLineSignature(body, validSignature, secret)).toBe(true);
      expect(verifyLineSignature(body, 'invalid_sig', secret)).toBe(false);
    });
  });
});
