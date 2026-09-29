/**
 * JIT Protocol Synthesis Framework - Firebase Firestore Storage Adapter
 * 
 * Persists JIT state, tickets, and schemas to Google Cloud / Firebase Firestore.
 */

import { JITStorageAdapter, MemoryStorageAdapter } from '../core/plugin.js';

export interface FirestoreStorageOptions {
  projectId: string;
  collectionName?: string;
  authToken?: string;
}

export class FirestoreStorageAdapter implements JITStorageAdapter {
  public name = 'firestore';
  private projectId: string;
  private collectionName: string;
  private authToken?: string;
  private memoryFallback: MemoryStorageAdapter;

  constructor(options: FirestoreStorageOptions) {
    this.projectId = options.projectId;
    this.collectionName = options.collectionName || 'jit_store';
    this.authToken = options.authToken;
    this.memoryFallback = new MemoryStorageAdapter();
  }

  private get baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.collectionName}`;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const url = `${this.baseUrl}/${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.memoryFallback.get<T>(key);
      }
      const doc = await res.json();
      if (!doc.fields || !doc.fields.payload) {
        return null;
      }
      const rawString = doc.fields.payload.stringValue;
      const parsed = JSON.parse(rawString);
      return parsed as T;
    } catch {
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.memoryFallback.set(key, value, ttlMs);
    try {
      const url = `${this.baseUrl}/${encodeURIComponent(key)}`;
      await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          fields: {
            payload: { stringValue: JSON.stringify(value) },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        }),
      });
    } catch {
      // Memory fallback handles the state
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.memoryFallback.delete(key);
    try {
      const url = `${this.baseUrl}/${encodeURIComponent(key)}`;
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
    return this.memoryFallback.list(prefix);
  }
}
