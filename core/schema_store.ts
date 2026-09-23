import * as fs from 'fs';
import * as path from 'path';
import { SchemaSnapshot } from './types.js';

export interface SchemaStoreOptions {
  filePath?: string;
  autoSave?: boolean;
}

export class SchemaStore {
  private filePath: string;

  constructor(options?: SchemaStoreOptions) {
    this.filePath = options?.filePath || path.resolve(process.cwd(), '.jit', 'schemas.json');
  }

  public getFilePath(): string {
    return this.filePath;
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
   * Load snapshot from disk
   */
  public load(): SchemaSnapshot | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as SchemaSnapshot;
      if (data && typeof data === 'object' && data.schemas) {
        return data;
      }
      return null;
    } catch (err: any) {
      console.warn(`[SchemaStore] Failed to load schema snapshot from ${this.filePath}:`, err.message);
      return null;
    }
  }

  /**
   * Save snapshot to disk safely
   */
  public save(snapshot: SchemaSnapshot): void {
    try {
      this.ensureDirectory();
      const content = JSON.stringify(snapshot, null, 2);
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
