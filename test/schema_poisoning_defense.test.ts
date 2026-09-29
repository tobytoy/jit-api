import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SchemaStore } from '../core/schema_store.js';
import { SchemaSnapshot, IRSchema } from '../core/types.js';
import { SignedStorageAdapter } from '../core/signed_storage.js';
import { MemoryStorageAdapter } from '../core/plugin.js';

describe('Anti-Poisoning & Cryptographic Schema Integrity Defense', () => {
  const secretKey = 'cluster-hmac-master-key-xyz!';
  const testStoreDir = path.resolve(process.cwd(), '.jit', 'test_poisoning');
  const testStorePath = path.join(testStoreDir, 'schemas.json');

  const sampleSchema: IRSchema = {
    name: 'CreateOrder',
    route: '/api/orders',
    version: 1,
    fields: {
      orderId: { name: 'orderId', type: 'string', required: true },
      amount: { name: 'amount', type: 'number', required: true },
    },
    samplePayload: { orderId: 'ord_123', amount: 500 },
  };

  const sampleSnapshot: SchemaSnapshot = {
    exportedAt: '2026-09-29T15:00:00.000Z',
    version: '1.0.0',
    schemas: {
      '/api/orders': [sampleSchema],
    },
  };

  describe('SchemaStore HMAC-SHA256 Signing & Verification', () => {
    it('should save snapshot with cryptographic HMAC-SHA256 signature', () => {
      const store = new SchemaStore({
        filePath: testStorePath,
        secretKey,
      });

      store.save(sampleSnapshot);
      expect(fs.existsSync(testStorePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(testStorePath, 'utf-8'));
      expect(raw.signature).toBeDefined();
      expect(typeof raw.signature).toBe('string');
      expect(raw.signedAt).toBeDefined();
    });

    it('should successfully load valid signed schema snapshot', () => {
      const store = new SchemaStore({
        filePath: testStorePath,
        secretKey,
      });

      const loaded = store.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.schemas['/api/orders'][0].route).toBe('/api/orders');
    });

    it('should reject tampered schema snapshot and prevent cluster poisoning', () => {
      // Attacker tampers with schemas.json in storage / shared cache
      const raw = JSON.parse(fs.readFileSync(testStorePath, 'utf-8'));
      raw.schemas['/api/orders'][0].route = '/api/injected_backdoor';
      fs.writeFileSync(testStorePath, JSON.stringify(raw, null, 2), 'utf-8');

      const store = new SchemaStore({
        filePath: testStorePath,
        secretKey,
      });

      // Loading tampered snapshot must return null and block injection
      const loaded = store.load();
      expect(loaded).toBeNull();
    });

    it('should reject unsigned snapshot when strictSignature is enabled', () => {
      // Write snapshot without signature
      const unsignedSnapshot: SchemaSnapshot = {
        exportedAt: '2026-09-29T15:00:00.000Z',
        version: '1.0.0',
        schemas: { '/api/orders': [sampleSchema] },
      };
      fs.writeFileSync(testStorePath, JSON.stringify(unsignedSnapshot, null, 2), 'utf-8');

      const strictStore = new SchemaStore({
        filePath: testStorePath,
        secretKey,
        strictSignature: true,
      });

      const loaded = strictStore.load();
      expect(loaded).toBeNull();
    });

    // Cleanup
    afterAll(() => {
      if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
      if (fs.existsSync(testStoreDir)) fs.rmdirSync(testStoreDir);
    });
  });

  describe('SignedStorageAdapter (Redis / Shared Cache Anti-Poisoning Wrapper)', () => {
    it('should sign values and transparently verify them on read', async () => {
      const memory = new MemoryStorageAdapter();
      const signedStorage = new SignedStorageAdapter(memory, { secretKey });

      await signedStorage.set('frozen:schemas', sampleSnapshot);

      const retrieved = await signedStorage.get<SchemaSnapshot>('frozen:schemas');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.schemas['/api/orders'][0].route).toBe('/api/orders');
    });

    it('should detect cache poisoning when Redis data is maliciously altered and return null', async () => {
      const memory = new MemoryStorageAdapter();
      const signedStorage = new SignedStorageAdapter(memory, { secretKey });

      await signedStorage.set('frozen:schemas', sampleSnapshot);

      // Malicious attacker or SSRF compromises underlying storage and alters payload
      const envelope = await memory.get<any>('frozen:schemas');
      expect(envelope.signature).toBeDefined();

      // Attacker tampers with the data inside Redis
      envelope.data.schemas['/api/orders'][0].fields.amount.type = 'any';
      await memory.set('frozen:schemas', envelope);

      // Client reading through SignedStorageAdapter must detect tampering and reject
      const poisoned = await signedStorage.get<SchemaSnapshot>('frozen:schemas');
      expect(poisoned).toBeNull();
    });

    it('should reject unsigned data in strict mode', async () => {
      const memory = new MemoryStorageAdapter();
      const strictStorage = new SignedStorageAdapter(memory, { secretKey, strict: true });

      // Put raw unsigned object directly in storage
      await memory.set('frozen:schemas', sampleSnapshot);

      const result = await strictStorage.get<SchemaSnapshot>('frozen:schemas');
      expect(result).toBeNull();
    });
  });
});
