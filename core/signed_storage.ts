/**
 * JIT Protocol Synthesis Framework - Signed Storage Adapter (Anti-Poisoning Wrapper)
 * 
 * Cryptographically wraps any JITStorageAdapter (Redis / Upstash / Supabase / Firestore)
 * with HMAC-SHA256 signatures, ensuring zero cache-poisoning or contract-tampering
 * across distributed Kubernetes clusters or serverless environments.
 */

import crypto from 'node:crypto';
import { JITStorageAdapter } from './plugin.js';

export interface SignedStorageOptions {
  secretKey: string;
  strict?: boolean; // If true, strictly rejects legacy unsigned cache items
}

export interface SignedEnvelope<T = any> {
  data: T;
  signature: string;
  timestamp: number;
}

export class SignedStorageAdapter implements JITStorageAdapter {
  public name: string;
  private underlying: JITStorageAdapter;
  private secretKey: string;
  private strict: boolean;

  constructor(underlying: JITStorageAdapter, options: SignedStorageOptions) {
    this.underlying = underlying;
    this.name = `signed-${underlying.name}`;
    this.secretKey = options.secretKey;
    this.strict = options.strict ?? false;
  }

  private computeSignature(serializedData: string): string {
    return crypto.createHmac('sha256', this.secretKey).update(serializedData).digest('hex');
  }

  async get<T = any>(key: string): Promise<T | null> {
    const envelope = await this.underlying.get<SignedEnvelope<T> | T>(key);
    if (envelope === null || envelope === undefined) {
      return null;
    }

    // Check if envelope has HMAC signature
    if (envelope && typeof envelope === 'object' && 'signature' in envelope && 'data' in envelope) {
      const signedEnv = envelope as SignedEnvelope<T>;
      const serialized = JSON.stringify(signedEnv.data);
      const expected = this.computeSignature(serialized);

      const actualBuf = Buffer.from(signedEnv.signature, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');

      if (actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf)) {
        return signedEnv.data;
      }

      console.error(
        `[SignedStorageAdapter] 🚨 Cache Poisoning Alert! Data for key '${key}' in '${this.underlying.name}' has been tampered with. Signature verification failed. Rejecting corrupted item.`
      );
      return null;
    }

    // Unsigned data handling
    if (this.strict) {
      console.warn(
        `[SignedStorageAdapter] Rejecting unsigned data for key '${key}' in strict mode.`
      );
      return null;
    }

    return envelope as T;
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const signature = this.computeSignature(serialized);
    const envelope: SignedEnvelope<T> = {
      data: value,
      signature,
      timestamp: Date.now(),
    };
    await this.underlying.set(key, envelope, ttlMs);
  }

  async delete(key: string): Promise<boolean> {
    return await this.underlying.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    if (this.underlying.list) {
      return await this.underlying.list(prefix);
    }
    return [];
  }
}
