/**
 * Markdown API Specification Loader
 * 
 * Scans, loads, and hot-reloads *.api.md files from a specs directory.
 */

import fs from 'fs';
import path from 'path';
import { JITEngine } from './jit_engine.js';
import { MDParser, ParsedMDSpec } from './md_parser.js';

export interface SpecInfo {
  filename: string;
  route: string;
  description: string;
  path: string;
  fieldsCount: number;
}

export class MDLoader {
  private specsDir: string;

  constructor(specsDir?: string) {
    const defaultDir = process.env.JIT_SPECS_DIR || path.resolve(process.cwd(), 'specs');
    this.specsDir = specsDir ? path.resolve(specsDir) : defaultDir;
    if (!fs.existsSync(this.specsDir)) {
      fs.mkdirSync(this.specsDir, { recursive: true });
    }
  }

  public getSpecsDir(): string {
    return this.specsDir;
  }

  /**
   * List all *.api.md spec files with metadata
   */
  public listSpecs(): SpecInfo[] {
    if (!fs.existsSync(this.specsDir)) return [];

    const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
    const result: SpecInfo[] = [];

    for (const file of files) {
      const fullPath = path.join(this.specsDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const spec = MDParser.parse(content);
        result.push({
          filename: file,
          route: spec.route,
          description: spec.description,
          path: fullPath,
          fieldsCount: spec.fields.length,
        });
      } catch (err: any) {
        console.warn(`[MDLoader] Failed to read spec ${file}:`, err.message);
      }
    }

    return result;
  }

  /**
   * Read raw content of a specific spec file
   */
  public getSpecContent(filename: string): string {
    const fullPath = path.join(this.specsDir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Spec file not found: ${filename}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Save content to a spec file
   */
  public saveSpec(filename: string, content: string): void {
    if (!filename.endsWith('.md')) {
      filename = `${filename}.api.md`;
    }
    const fullPath = path.join(this.specsDir, filename);
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  /**
   * Load and register all *.api.md files into the JITEngine
   */
  public loadAll(engine: JITEngine): ParsedMDSpec[] {
    if (!fs.existsSync(this.specsDir)) return [];

    const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
    const loadedSpecs: ParsedMDSpec[] = [];

    for (const file of files) {
      const fullPath = path.join(this.specsDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const spec = MDParser.parse(content);
        const routeDef = MDParser.toRouteDefinition(spec);
        engine.register(routeDef);
        loadedSpecs.push(spec);
      } catch (err: any) {
        console.error(`[MDLoader] Error loading spec file ${file}:`, err.message);
      }
    }

    return loadedSpecs;
  }

  /**
   * Reload all specs into the engine (Hot-Reload)
   */
  public reload(engine: JITEngine): ParsedMDSpec[] {
    return this.loadAll(engine);
  }

  /**
   * Watch specs directory and automatically hot-reload when files change
   */
  public watch(engine: JITEngine, onReload?: (specs: ParsedMDSpec[]) => void): () => void {
    if (!fs.existsSync(this.specsDir)) return () => {};

    let debounceTimer: NodeJS.Timeout | null = null;
    const watcher = fs.watch(this.specsDir, (eventType, filename) => {
      if (!filename || (!filename.endsWith('.api.md') && !filename.endsWith('.md'))) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const reloaded = this.reload(engine);
          console.log(`\n🔄 [MDLoader] 偵測到 ${filename} 變更，已自動動態熱加載 ${reloaded.length} 支最新 API！`);
          if (onReload) onReload(reloaded);
        } catch (err: any) {
          console.warn('[MDLoader] 自動熱重載失敗:', err.message);
        }
      }, 200);
    });

    return () => watcher.close();
  }
}
