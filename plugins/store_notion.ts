/**
 * JIT Protocol Synthesis Framework - Notion Database Storage Adapter
 * 
 * Uses Notion Databases as a visual, collaborative CMS / backend for JIT APIs.
 */

import { JITStorageAdapter, MemoryStorageAdapter, JITPlugin } from '../core/plugin.js';

export interface NotionStorageOptions {
  /**
   * Notion Internal Integration Secret (starts with 'secret_...')
   */
  apiKey?: string;

  /**
   * Notion Database ID (32-character hex ID from URL)
   */
  databaseId?: string;

  /**
   * Key property name in the Notion Database (defaults to 'Name' or 'Key')
   */
  keyProperty?: string;

  /**
   * Value property name (defaults to 'Value' or 'Content')
   */
  valueProperty?: string;
}

export class NotionStorageAdapter implements JITStorageAdapter {
  public name = 'notion';
  private apiKey?: string;
  private databaseId?: string;
  private keyProperty: string;
  private valueProperty: string;
  private memoryFallback: MemoryStorageAdapter;

  constructor(options: NotionStorageOptions = {}) {
    this.apiKey = options.apiKey || process.env.NOTION_API_KEY;
    this.databaseId = options.databaseId || process.env.NOTION_DATABASE_ID;
    this.keyProperty = options.keyProperty || 'Key';
    this.valueProperty = options.valueProperty || 'Value';
    this.memoryFallback = new MemoryStorageAdapter();
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.apiKey || !this.databaseId) {
      return this.memoryFallback.get<T>(key);
    }

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${this.databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: {
            property: this.keyProperty,
            title: { equals: key },
          },
          page_size: 1,
        }),
      });

      if (!res.ok) return this.memoryFallback.get<T>(key);
      const data = await res.json();
      if (!data.results || data.results.length === 0) return null;

      const page = data.results[0];
      const valProp = page.properties[this.valueProperty];
      if (!valProp) return null;

      let rawStr = '';
      if (valProp.rich_text && valProp.rich_text.length > 0) {
        rawStr = valProp.rich_text.map((t: any) => t.plain_text).join('');
      } else if (valProp.title && valProp.title.length > 0) {
        rawStr = valProp.title.map((t: any) => t.plain_text).join('');
      }

      try {
        return JSON.parse(rawStr) as T;
      } catch {
        return (rawStr || null) as any;
      }
    } catch {
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.memoryFallback.set(key, value, ttlMs);
    if (!this.apiKey || !this.databaseId) return;

    try {
      const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

      // Check if page already exists
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${this.databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: {
            property: this.keyProperty,
            title: { equals: key },
          },
          page_size: 1,
        }),
      });

      if (queryRes.ok) {
        const queryData = await queryRes.json();
        if (queryData.results && queryData.results.length > 0) {
          const pageId = queryData.results[0].id;
          await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'PATCH',
            headers: this.headers,
            body: JSON.stringify({
              properties: {
                [this.valueProperty]: {
                  rich_text: [{ type: 'text', text: { content: strVal } }],
                },
              },
            }),
          });
          return;
        }
      }

      // Create new page in database
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          parent: { database_id: this.databaseId },
          properties: {
            [this.keyProperty]: {
              title: [{ type: 'text', text: { content: key } }],
            },
            [this.valueProperty]: {
              rich_text: [{ type: 'text', text: { content: strVal } }],
            },
          },
        }),
      });
    } catch {
      // Memory fallback handles state
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.memoryFallback.delete(key);
    if (!this.apiKey || !this.databaseId) return true;

    try {
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${this.databaseId}/query`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: {
            property: this.keyProperty,
            title: { equals: key },
          },
          page_size: 1,
        }),
      });

      if (queryRes.ok) {
        const queryData = await queryRes.json();
        if (queryData.results && queryData.results.length > 0) {
          const pageId = queryData.results[0].id;
          await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'PATCH',
            headers: this.headers,
            body: JSON.stringify({ archived: true }),
          });
          return true;
        }
      }
      return true;
    } catch {
      return true;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    return this.memoryFallback.list(prefix);
  }
}

/**
 * Factory for Notion Storage Plugin
 */
export function createNotionPlugin(options: NotionStorageOptions = {}): JITPlugin {
  return {
    name: 'store-notion',
    version: '1.4.1',
    description: 'Notion Database Storage & Headless CMS Adapter for JIT API',
    storageAdapter: new NotionStorageAdapter(options),
  };
}
