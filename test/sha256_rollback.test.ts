import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MDLoader } from '../core/md_loader.js';
import { JITEngine } from '../core/jit_engine.js';

describe('S4: Snapshot SHA-256 Signature & Anti-Tamper Rollback', () => {
    const testDir = path.resolve(process.cwd(), 'scratch/test_sha256_workspace');
    const specsDir = path.join(testDir, 'specs');
    const releasesDir = path.join(testDir, 'releases');

    beforeEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(specsDir, { recursive: true });
        fs.mkdirSync(releasesDir, { recursive: true });

        // Create sample spec with proper header
        fs.writeFileSync(path.join(specsDir, 'item.api.md'), `# API: items
Version: 1.0.0

## Logic
\`\`\`javascript
return [{ id: 1, name: "Original Item" }];
\`\`\`
`);
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should generate sha256 checksums in manifest on snapshotRelease', () => {
        const loader = new MDLoader(specsDir, releasesDir);
        const release = loader.snapshotRelease('v1.0.0', 'Initial release');

        expect(release.version).toBe('v1.0.0');
        expect(release.specs).toBeDefined();
        const itemSpec = release.specs.find((s) => s.filename === 'item.api.md');
        expect(itemSpec).toBeDefined();
        expect(itemSpec?.sha256).toBeDefined();
        expect(itemSpec?.sha256?.length).toBe(64); // SHA-256 hex length

        const manifestPath = path.join(releasesDir, 'v1.0.0', 'manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        expect(manifest.specs[0].sha256).toBe(itemSpec?.sha256);
    });

    it('should successfully rollback when checksums match', () => {
        const loader = new MDLoader(specsDir, releasesDir);
        loader.snapshotRelease('v1.0.0', 'Initial release');

        // Modify spec in specs/
        fs.writeFileSync(path.join(specsDir, 'item.api.md'), `# API: items
Version: 1.0.0

## Logic
\`\`\`javascript
return [{ id: 2, name: "Mutated Item" }];
\`\`\`
`);

        // Rollback
        const engine = new JITEngine();
        const result = loader.rollback('v1.0.0', engine);
        expect(result.success).toBe(true);
        expect(result.restoredCount).toBe(1);

        // Verify content was restored
        const restored = fs.readFileSync(path.join(specsDir, 'item.api.md'), 'utf8');
        expect(restored).toContain('Original Item');
    });

    it('should reject rollback and throw Security Alert when release snapshot has been tampered with', () => {
        const loader = new MDLoader(specsDir, releasesDir);
        loader.snapshotRelease('v1.0.0', 'Initial release');

        // Tamper with file inside the release snapshot directory!
        const snapshotFile = path.join(releasesDir, 'v1.0.0', 'item.api.md');
        fs.writeFileSync(snapshotFile, `# API: items
Version: 1.0.0

## Logic
\`\`\`javascript
// MALICIOUS INJECTION
return { hacked: true };
\`\`\`
`);

        // Rollback should fail with security alert
        const engine = new JITEngine();
        expect(() => {
            loader.rollback('v1.0.0', engine);
        }).toThrow(/\[Security Alert\]/);
    });
});
