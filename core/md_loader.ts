/**
 * Markdown API Specification Loader
 * 
 * Scans, loads, and hot-reloads *.api.md files from a specs directory.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { JITEngine } from './jit_engine.js';
import { MDParser, ParsedMDSpec } from './md_parser.js';

export interface SpecInfo {
  filename: string;
  route: string;
  version?: string;
  stage?: 'dev' | 'prod';
  description: string;
  path: string;
  fieldsCount: number;
  samplePayload?: Record<string, any>;
  sampleSemantic?: string;
}

export interface ReleaseInfo {
  version: string;
  releasedAt: string;
  specsCount: number;
  notes?: string;
  specs: Array<{ route: string; version?: string; filename: string; sha256?: string }>;
}

export class MDLoader {
  private specsDir: string;
  private releasesDir: string;

  constructor(specsDir?: string, releasesDir?: string) {
    const defaultDir = process.env.JIT_SPECS_DIR || path.resolve(process.cwd(), 'specs');
    this.specsDir = specsDir ? path.resolve(specsDir) : defaultDir;
    this.releasesDir = releasesDir ? path.resolve(releasesDir) : path.resolve(process.cwd(), '.jit', 'releases');
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
  public listSpecs(filterStage?: 'all' | 'prod' | 'dev'): SpecInfo[] {
    if (!fs.existsSync(this.specsDir)) return [];

    const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
    const result: SpecInfo[] = [];

    for (const file of files) {
      const fullPath = path.join(this.specsDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const spec = MDParser.parse(content, file);

        if (filterStage && filterStage !== 'all' && spec.stage !== filterStage) {
          continue;
        }

        result.push({
          filename: file,
          route: spec.route,
          version: spec.version,
          stage: spec.stage,
          description: spec.description,
          path: fullPath,
          fieldsCount: spec.fields.length,
          samplePayload: spec.samplePayload,
          sampleSemantic: spec.sampleSemantic,
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
  public loadAll(engine: JITEngine, filterStage?: 'all' | 'prod' | 'dev'): ParsedMDSpec[] {
    if (!fs.existsSync(this.specsDir)) return [];

    const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
    const loadedSpecs: ParsedMDSpec[] = [];

    for (const file of files) {
      const fullPath = path.join(this.specsDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const spec = MDParser.parse(content, file);

        // In prod mode, ignore dev/draft APIs
        if (filterStage && filterStage !== 'all' && spec.stage !== filterStage) {
          continue;
        }

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
  public reload(engine: JITEngine, filterStage?: 'all' | 'prod' | 'dev'): ParsedMDSpec[] {
    return this.loadAll(engine, filterStage);
  }

  /**
   * Watch specs directory and automatically hot-reload when files change
   */
  public watch(engine: JITEngine, onReload?: (specs: ParsedMDSpec[]) => void, filterStage?: 'all' | 'prod' | 'dev'): () => void {
    if (!fs.existsSync(this.specsDir)) return () => {};

    let debounceTimer: NodeJS.Timeout | null = null;
    const watcher = fs.watch(this.specsDir, (eventType, filename) => {
      if (!filename || (!filename.endsWith('.api.md') && !filename.endsWith('.md'))) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const reloaded = this.reload(engine, filterStage);
          console.log(`\n🔄 [MDLoader] 偵測到 ${filename} 變更，已自動動態熱加載 ${reloaded.length} 支最新 API！`);
          if (onReload) onReload(reloaded);
        } catch (err: any) {
          console.warn('[MDLoader] 自動熱重載失敗:', err.message);
        }
      }, 200);
    });

    return () => watcher.close();
  }

  /**
   * Snapshot current specs as a version release in .jit/releases/<version>/
   */
  public snapshotRelease(version: string, notes?: string): ReleaseInfo {
    const cleanVersion = version.startsWith('v') ? version : `v${version}`;
    const targetDir = path.join(this.releasesDir, cleanVersion);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
    const specsSummary: Array<{ route: string; version?: string; filename: string; sha256?: string }> = [];

    for (const file of files) {
      const src = path.join(this.specsDir, file);
      const dest = path.join(targetDir, file);
      const content = fs.readFileSync(src, 'utf-8');
      fs.writeFileSync(dest, content, 'utf-8');
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      try {
        const parsed = MDParser.parse(content, file);
        specsSummary.push({
          route: parsed.route,
          version: parsed.version,
          filename: file,
          sha256,
        });
      } catch {
        specsSummary.push({ route: file, filename: file, sha256 });
      }
    }

    const releaseManifest: ReleaseInfo = {
      version: cleanVersion,
      releasedAt: new Date().toISOString(),
      specsCount: specsSummary.length,
      notes: notes || `Release ${cleanVersion}`,
      specs: specsSummary,
    };

    fs.writeFileSync(
      path.join(targetDir, 'manifest.json'),
      JSON.stringify(releaseManifest, null, 2),
      'utf-8'
    );

    return releaseManifest;
  }

  /**
   * List all archived version releases
   */
  public listReleases(): ReleaseInfo[] {
    if (!fs.existsSync(this.releasesDir)) return [];

    const dirs = fs.readdirSync(this.releasesDir).filter((d) => {
      const full = path.join(this.releasesDir, d);
      return fs.statSync(full).isDirectory();
    });

    const releases: ReleaseInfo[] = [];
    for (const dir of dirs) {
      const manifestPath = path.join(this.releasesDir, dir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          releases.push(manifest);
        } catch {
          // ignore corrupted manifest
        }
      }
    }

    // Sort descending by releasedAt
    return releases.sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
  }

  /**
   * Instant rollback: restore specs from an archived version release and hot-reload engine.
   * Cleans and backs up orphaned specs that exist in specsDir but are not in the snapshot.
   */
  public rollback(
    version: string,
    engine: JITEngine,
    filterStage?: 'all' | 'prod' | 'dev',
    options: { cleanOrphans?: boolean } = { cleanOrphans: true }
  ): {
    success: boolean;
    version: string;
    restoredCount: number;
    orphanedCount: number;
    orphanedBackupDir?: string;
  } {
    const cleanVersion = version.startsWith('v') ? version : `v${version}`;
    const targetDir = path.join(this.releasesDir, cleanVersion);

    if (!fs.existsSync(targetDir)) {
      throw new Error(`找不到版本快照目錄: ${cleanVersion}`);
    }

    const snapshotFiles = fs
      .readdirSync(targetDir)
      .filter((f) => (f.endsWith('.api.md') || f.endsWith('.md')) && f !== 'manifest.json');
    if (snapshotFiles.length === 0) {
      throw new Error(`版本 ${cleanVersion} 快照中無任何規格檔案。`);
    }

    // Verify cryptographic SHA-256 signatures before restoring
    const manifestPath = path.join(targetDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest: ReleaseInfo = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const hashLookup = new Map<string, string>();
        manifest.specs.forEach((s) => {
          if (s.sha256) hashLookup.set(s.filename, s.sha256);
        });

        for (const file of snapshotFiles) {
          const expectedHash = hashLookup.get(file);
          if (expectedHash) {
            const fileContent = fs.readFileSync(path.join(targetDir, file), 'utf-8');
            const actualHash = crypto.createHash('sha256').update(fileContent).digest('hex');
            if (actualHash !== expectedHash) {
              throw new Error(`[Security Alert] 快照檔案完整性驗證失敗！檔案 '${file}' 雜湊值不符 (預期: ${expectedHash}, 實際: ${actualHash})，疑似遭竄改或損壞，已中斷降版。`);
            }
          }
        }
      } catch (err: any) {
        if (err.message.includes('完整性驗證失敗')) {
          throw err;
        }
      }
    }

    // Identify orphaned specs currently in specsDir that are NOT in the target snapshot
    const currentSpecs = fs.existsSync(this.specsDir)
      ? fs.readdirSync(this.specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'))
      : [];
    const snapshotFileSet = new Set(snapshotFiles);
    const orphanedFiles = currentSpecs.filter((f) => !snapshotFileSet.has(f));

    let orphanedBackupDir: string | undefined;

    // Isolate & archive orphaned specs if cleanOrphans is true
    if (options.cleanOrphans && orphanedFiles.length > 0) {
      orphanedBackupDir = path.join(this.releasesDir, `orphaned_${Date.now()}`);
      if (!fs.existsSync(orphanedBackupDir)) {
        fs.mkdirSync(orphanedBackupDir, { recursive: true });
      }

      for (const orphan of orphanedFiles) {
        const src = path.join(this.specsDir, orphan);
        const dest = path.join(orphanedBackupDir, orphan);
        fs.renameSync(src, dest);
      }
    }

    // Copy snapshot files back to specsDir
    for (const file of snapshotFiles) {
      const src = path.join(targetDir, file);
      const dest = path.join(this.specsDir, file);
      fs.copyFileSync(src, dest);
    }

    // Hot-reload into engine
    this.reload(engine, filterStage);

    return {
      success: true,
      version: cleanVersion,
      restoredCount: snapshotFiles.length,
      orphanedCount: orphanedFiles.length,
      orphanedBackupDir,
    };
  }
}
