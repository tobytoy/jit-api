import * as fs from 'fs';
import * as path from 'path';
import crypto from 'node:crypto';
import { SchemaSnapshot } from './types.js';

export interface SchemaStoreOptions {
  filePath?: string;
  autoSave?: boolean;
  secretKey?: string;        // Secret key for HMAC-SHA256 signature to prevent schema poisoning
  strictSignature?: boolean; // If true, strictly rejects unsigned snapshots in production
}

export class SchemaStore {
  private filePath: string;
  private secretKey?: string;
  private strictSignature: boolean;

  constructor(options?: SchemaStoreOptions) {
    this.filePath = options?.filePath || path.resolve(process.cwd(), '.jit', 'schemas.json');
    this.secretKey =
      options?.secretKey ||
      process.env.JIT_SCHEMA_SECRET ||
      process.env.JIT_MASTER_KEY;
    this.strictSignature = options?.strictSignature ?? false;
  }

  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Compute deterministic HMAC-SHA256 signature over snapshot payload
   */
  public static computeSignature(
    snapshot: { exportedAt: string; version: string; schemas: any },
    secretKey: string
  ): string {
    const payloadToSign = JSON.stringify({
      exportedAt: snapshot.exportedAt,
      version: snapshot.version,
      schemas: snapshot.schemas,
    });
    return crypto.createHmac('sha256', secretKey).update(payloadToSign).digest('hex');
  }

  /**
   * Cryptographically sign a snapshot with HMAC-SHA256
   */
  public static signSnapshot(snapshot: SchemaSnapshot, secretKey: string): SchemaSnapshot {
    const signature = this.computeSignature(snapshot, secretKey);
    return {
      ...snapshot,
      signature,
      signedAt: Date.now(),
    };
  }

  /**
   * Verify snapshot signature in constant time against timing attacks
   */
  public static verifySnapshot(snapshot: SchemaSnapshot, secretKey: string): boolean {
    if (!snapshot.signature) return false;
    const expected = this.computeSignature(snapshot, secretKey);
    const actualBuf = Buffer.from(snapshot.signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  }

  /**
   * Ensure storage directory exists
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load snapshot from disk with tamper-proofing and anti-poisoning validation
   */
  public load(): SchemaSnapshot | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as SchemaSnapshot;
      if (!data || typeof data !== 'object' || !data.schemas) {
        return null;
      }

      // Cryptographic Anti-Poisoning Verification
      if (this.secretKey) {
        if (data.signature) {
          const isValid = SchemaStore.verifySnapshot(data, this.secretKey);
          if (!isValid) {
            console.error(
              `[SchemaStore Security Alert] 🚨 Tamper detected in schema snapshot from ${this.filePath}! Signature mismatch. Potential cache/schema poisoning attack. Rejecting untrusted schema.`
            );
            return null;
          }
        } else if (this.strictSignature) {
          console.error(
            `[SchemaStore Security Alert] 🚨 Schema snapshot from ${this.filePath} is unsigned while strictSignature is enabled. Rejecting untrusted schema.`
          );
          return null;
        }
      }

      return data;
    } catch (err: any) {
      console.warn(`[SchemaStore] Failed to load schema snapshot from ${this.filePath}:`, err.message);
      return null;
    }
  }

  /**
   * Save snapshot to disk safely with cryptographic HMAC signature
   */
  public save(snapshot: SchemaSnapshot): void {
    try {
      this.ensureDirectory();

      let dataToSave = snapshot;
      if (this.secretKey) {
        dataToSave = SchemaStore.signSnapshot(snapshot, this.secretKey);
      }

      const content = JSON.stringify(dataToSave, null, 2);
      fs.writeFileSync(this.filePath, content, 'utf-8');
    } catch (err: any) {
      console.warn(`[SchemaStore] Failed to save schema snapshot to ${this.filePath}:`, err.message);
    }
  }

  /**
   * Delete snapshot file
   */
  public clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore
    }
  }
}
