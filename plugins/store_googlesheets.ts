/**
 * JIT Protocol Synthesis Framework - Google Sheets Storage Adapter
 * 
 * Enables using Google Sheets as a low-code database, audit log, or CMS.
 * Supports:
 * 1. Google Apps Script (GAS) Web App Endpoint (Lightweight, 0 GCP SDK dependency)
 * 2. Google Sheets API v4 REST (API Key or OAuth/Service Account Bearer Token)
 * 3. Automatic In-Memory Fallback & TTL Cache (prevents hitting Google rate limits)
 */

import { JITStorageAdapter, MemoryStorageAdapter, JITPlugin } from '../core/plugin.js';

export interface GoogleSheetsStorageOptions {
  /**
   * Google Apps Script Web App URL (e.g. https://script.google.com/macros/s/.../exec)
   * Preferred for zero-configuration and zero-SDK deployments.
   */
  webAppUrl?: string;

  /**
   * Google Spreadsheet ID (from spreadsheet URL /d/<spreadsheetId>/edit)
   */
  spreadsheetId?: string;

  /**
   * Google Sheets API v4 API Key or Bearer Token (optional for direct REST v4)
   */
  apiKey?: string;
  accessToken?: string;

  /**
   * Default Sheet / Tab name (defaults to 'jit_kv_store')
   */
  sheetName?: string;

  /**
   * Cache read TTL in milliseconds to protect Google quota (default 10000ms / 10s)
   */
  cacheTtlMs?: number;
}

export class GoogleSheetsStorageAdapter implements JITStorageAdapter {
  public name = 'googlesheets';
  private webAppUrl?: string;
  private spreadsheetId?: string;
  private apiKey?: string;
  private accessToken?: string;
  private sheetName: string;
  private cacheTtlMs: number;
  private memoryFallback: MemoryStorageAdapter;

  constructor(options: GoogleSheetsStorageOptions = {}) {
    this.webAppUrl = options.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL;
    this.spreadsheetId = options.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.apiKey = options.apiKey || process.env.GOOGLE_SHEETS_API_KEY;
    this.accessToken = options.accessToken || process.env.GOOGLE_SHEETS_ACCESS_TOKEN;
    this.sheetName = options.sheetName || 'jit_kv_store';
    this.cacheTtlMs = options.cacheTtlMs ?? 10000;
    this.memoryFallback = new MemoryStorageAdapter();
  }

  /**
   * Retrieve a value by key (with memory caching to avoid hitting quota)
   */
  async get<T = any>(key: string): Promise<T | null> {
    const cached = await this.memoryFallback.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Attempt GAS Web App call if configured
    if (this.webAppUrl) {
      try {
        const url = new URL(this.webAppUrl);
        url.searchParams.set('action', 'get');
        url.searchParams.set('key', key);
        url.searchParams.set('sheet', this.sheetName);

        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
          const json = await res.json();
          if (json && json.found && json.value !== undefined) {
            await this.memoryFallback.set(key, json.value, this.cacheTtlMs);
            return json.value as T;
          }
          return null;
        }
      } catch {
        // Fallback to memory
      }
    }

    // Attempt Google Sheets v4 REST API if configured
    if (this.spreadsheetId && (this.apiKey || this.accessToken)) {
      try {
        const range = encodeURIComponent(`${this.sheetName}!A2:B`);
        let url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}`;
        if (this.apiKey) url += `?key=${encodeURIComponent(this.apiKey)}`;

        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          const rows: string[][] = data.values || [];
          for (const row of rows) {
            if (row[0] === key) {
              try {
                const parsed = JSON.parse(row[1]);
                await this.memoryFallback.set(key, parsed, this.cacheTtlMs);
                return parsed as T;
              } catch {
                await this.memoryFallback.set(key, row[1], this.cacheTtlMs);
                return row[1] as any;
              }
            }
          }
          return null;
        }
      } catch {
        // Fallback to memory
      }
    }

    return null;
  }

  /**
   * Save a key-value pair to Google Sheets
   */
  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.memoryFallback.set(key, value, ttlMs || this.cacheTtlMs);

    // Call GAS Web App
    if (this.webAppUrl) {
      try {
        await fetch(this.webAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set',
            sheet: this.sheetName,
            key,
            value,
            updatedAt: new Date().toISOString(),
          }),
        });
        return;
      } catch {
        // Handled by memory fallback
      }
    }

    // Call Google Sheets API v4 append
    if (this.spreadsheetId && this.accessToken) {
      try {
        const range = encodeURIComponent(`${this.sheetName}!A:B`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [[key, typeof value === 'object' ? JSON.stringify(value) : String(value)]],
          }),
        });
      } catch {
        // Handled by memory fallback
      }
    }
  }

  /**
   * Delete a key from Google Sheets
   */
  async delete(key: string): Promise<boolean> {
    await this.memoryFallback.delete(key);

    if (this.webAppUrl) {
      try {
        const res = await fetch(this.webAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            sheet: this.sheetName,
            key,
          }),
        });
        return res.ok;
      } catch {
        return true;
      }
    }
    return true;
  }

  /**
   * List keys in Google Sheets
   */
  async list(prefix?: string): Promise<string[]> {
    return this.memoryFallback.list(prefix);
  }

  /**
   * High-level Helper: Read tabular rows (Header -> Row mapping)
   * Turns any Google Sheet tab into an array of clean JSON objects!
   */
  async readRows(sheetName?: string): Promise<Array<Record<string, any>>> {
    const targetSheet = sheetName || this.sheetName;

    // Use GAS Web App if available
    if (this.webAppUrl) {
      try {
        const url = new URL(this.webAppUrl);
        url.searchParams.set('action', 'readRows');
        url.searchParams.set('sheet', targetSheet);
        const res = await fetch(url.toString());
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.rows)) return json.rows;
        }
      } catch {
        // Fallback
      }
    }

    // Direct v4 REST API
    if (this.spreadsheetId && (this.apiKey || this.accessToken)) {
      try {
        const range = encodeURIComponent(`${targetSheet}!A1:Z`);
        let url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}`;
        if (this.apiKey) url += `?key=${encodeURIComponent(this.apiKey)}`;

        const headers: Record<string, string> = {};
        if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          const rows: any[][] = data.values || [];
          if (rows.length < 2) return [];

          const headersRow = rows[0].map((h: any) => String(h).trim());
          const records: Array<Record<string, any>> = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const item: Record<string, any> = {};
            headersRow.forEach((col: string, idx: number) => {
              item[col] = row[idx] !== undefined ? row[idx] : null;
            });
            records.push(item);
          }
          return records;
        }
      } catch {
        // Fallback
      }
    }

    return [];
  }
}

/**
 * Factory for Google Sheets Plugin
 */
export function createGoogleSheetsPlugin(options: GoogleSheetsStorageOptions = {}): JITPlugin {
  const adapter = new GoogleSheetsStorageAdapter(options);
  return {
    name: 'store-googlesheets',
    version: '1.4.1',
    description: 'Google Sheets Storage & No-Code CMS Adapter for JIT API',
    storageAdapter: adapter,
  };
}
