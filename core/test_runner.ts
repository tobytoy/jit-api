/**
 * JIT Protocol Synthesis - Specification Test Runner
 * 
 * Automatically runs integration tests for all specs/*.api.md using their ## Sample definitions.
 */

import fs from 'fs';
import path from 'path';
import { JITEngine } from './jit_engine.js';
import { MDLoader } from './md_loader.js';
import { MDParser } from './md_parser.js';

export interface TestResultItem {
  filename: string;
  route: string;
  hasSemantic: boolean;
  semanticPassed?: boolean;
  semanticError?: string;
  hasPayload: boolean;
  payloadPassed?: boolean;
  payloadError?: string;
  durationMs: number;
}

export interface TestSummaryReport {
  totalSpecs: number;
  passedSpecs: number;
  failedSpecs: number;
  totalAssertions: number;
  passedAssertions: number;
  durationMs: number;
  items: TestResultItem[];
}

export class SpecTestRunner {
  private specsDir: string;

  constructor(specsDir?: string) {
    this.specsDir = specsDir ? path.resolve(specsDir) : path.resolve(process.cwd(), 'specs');
  }

  public async runAll(): Promise<TestSummaryReport> {
    const startTime = Date.now();
    const loader = new MDLoader(this.specsDir);
    const engine = new JITEngine();
    loader.loadAll(engine, 'all');

    if (!fs.existsSync(this.specsDir)) {
      return {
        totalSpecs: 0,
        passedSpecs: 0,
        failedSpecs: 0,
        totalAssertions: 0,
        passedAssertions: 0,
        durationMs: 0,
        items: [],
      };
    }

    const files = fs
      .readdirSync(this.specsDir)
      .filter((f) => f.endsWith('.api.md') || f.endsWith('.md'))
      .sort();

    const items: TestResultItem[] = [];
    let passedSpecs = 0;
    let failedSpecs = 0;
    let totalAssertions = 0;
    let passedAssertions = 0;

    for (const file of files) {
      const itemStart = Date.now();
      const filePath = path.join(this.specsDir, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      const spec = MDParser.parse(content, file);

      let itemFailed = false;
      const resultItem: TestResultItem = {
        filename: file,
        route: spec.route,
        hasSemantic: !!spec.sampleSemantic,
        hasPayload: !!spec.samplePayload,
        durationMs: 0,
      };

      // Header preparation for authenticated routes
      const headers: Record<string, string> = {};
      if (spec.auth && spec.auth.type !== 'none') {
        const headerName = spec.auth.header || (spec.auth.type === 'bearer' ? 'authorization' : 'x-api-key');
        const token = spec.auth.token || (spec.auth.envVar ? process.env[spec.auth.envVar] : 'test-token');
        headers[headerName.toLowerCase()] = spec.auth.type === 'bearer' ? `Bearer ${token}` : (token || '');
      }

      // Test 1: Fast-path payload test
      if (spec.samplePayload) {
        totalAssertions++;
        try {
          const res = await engine.execute({ route: spec.route, ...spec.samplePayload }, spec.route, headers);
          if (res.success) {
            resultItem.payloadPassed = true;
            passedAssertions++;
          } else {
            resultItem.payloadPassed = false;
            resultItem.payloadError = res.error || 'Execution returned success=false';
            itemFailed = true;
          }
        } catch (err: any) {
          resultItem.payloadPassed = false;
          resultItem.payloadError = err.message;
          itemFailed = true;
        }
      }

      // Test 2: Semantic Intent query test
      if (spec.sampleSemantic) {
        totalAssertions++;
        try {
          const res = await engine.execute({ message: spec.sampleSemantic }, undefined, headers);
          if (res.success && res.context.route === spec.route) {
            resultItem.semanticPassed = true;
            passedAssertions++;
          } else if (res.success) {
            resultItem.semanticPassed = false;
            resultItem.semanticError = `Matched '${res.context.route}' instead of expected '${spec.route}'`;
            itemFailed = true;
          } else {
            resultItem.semanticPassed = false;
            resultItem.semanticError = res.error || 'Semantic execution failed';
            itemFailed = true;
          }
        } catch (err: any) {
          resultItem.semanticPassed = false;
          resultItem.semanticError = err.message;
          itemFailed = true;
        }
      }

      resultItem.durationMs = Date.now() - itemStart;
      if (!itemFailed) {
        passedSpecs++;
      } else {
        failedSpecs++;
      }
      items.push(resultItem);
    }

    return {
      totalSpecs: files.length,
      passedSpecs,
      failedSpecs,
      totalAssertions,
      passedAssertions,
      durationMs: Date.now() - startTime,
      items,
    };
  }
}
