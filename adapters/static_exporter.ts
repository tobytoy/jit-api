/**
 * JIT Protocol Synthesis Framework - Static Pages Exporter
 * 
 * Compiles JIT Web Studio, Markdown Specs, and Smart Mock Engine into a 100%
 * standalone static bundle for GitHub Pages and Cloudflare Pages.
 */

import fs from 'fs';
import path from 'path';
import { MDParser } from '../core/md_parser.js';
import { MockGenerator } from '../core/mock_generator.js';

export interface StaticPagesExportOptions {
  specsDir?: string;
  publicDir?: string;
  outDir?: string;
  generateGithubWorkflow?: boolean;
}

export interface StaticPagesExportResult {
  outDir: string;
  specCount: number;
  filesGenerated: string[];
  workflowPath?: string;
}

export class StaticPagesExporter {
  public static async export(options?: StaticPagesExportOptions): Promise<StaticPagesExportResult> {
    const cwd = process.cwd();
    const specsDir = path.resolve(cwd, options?.specsDir || './specs');
    const publicDir = path.resolve(cwd, options?.publicDir || './public');
    const outDir = path.resolve(cwd, options?.outDir || './dist-pages');

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Copy public directory assets recursively
    const filesGenerated: string[] = [];
    if (fs.existsSync(publicDir)) {
      StaticPagesExporter.copyDirRecursive(publicDir, outDir, filesGenerated);
    }

    // 2. Parse all specs in specsDir
    const specs: any[] = [];
    const mocks: Record<string, any> = {};

    if (fs.existsSync(specsDir)) {
      const files = fs.readdirSync(specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(specsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = MDParser.parse(content, file);
          const mockData = parsed.mockResponse || parsed.samplePayload || { status: 'ok', route: parsed.route };
          specs.push({
            filename: file,
            route: parsed.route,
            description: parsed.description,
            stage: parsed.stage || 'prod',
            version: parsed.version || '1.0.0',
            auth: parsed.auth,
            fields: parsed.fields,
            sample: parsed.samplePayload,
            mockResponse: parsed.mockResponse,
            content,
          });
          mocks[parsed.route] = mockData;
        } catch (err) {
          console.warn(`[StaticExporter] Skipping ${file}:`, err);
        }
      }
    }

    // 3. Write compiled static data
    const staticData = {
      exportedAt: new Date().toISOString(),
      version: '1.4.1',
      specs,
      mocks,
    };
    const dataPath = path.join(outDir, 'jit-static-data.json');
    fs.writeFileSync(dataPath, JSON.stringify(staticData, null, 2), 'utf-8');
    filesGenerated.push(dataPath);

    // 4. Generate in-browser Mock Runtime Interceptor (jit-static-runtime.js)
    const runtimeJs = `
// JIT Protocol Synthesis - Client-side Static Runtime Interceptor
(function() {
  console.log('🚀 JIT Static Runtime Active: Zero-Backend Mode for GitHub Pages / Cloudflare Pages');
  
  let staticData = ${JSON.stringify(staticData)};

  // Intercept window.fetch to mock all API calls locally in browser
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const cleanUrl = url.split('?')[0];

    // Helper to return mock response
    function mockRes(body, status = 200) {
      return Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    if (cleanUrl.endsWith('/api/specs')) {
      return mockRes(staticData.specs);
    }
    if (cleanUrl.endsWith('/api/overview') || cleanUrl.endsWith('/api/stats')) {
      return mockRes({
        totalRoutes: staticData.specs.length,
        frozenCount: staticData.specs.length,
        avgLatencyMs: 0.05,
        totalRequests: 1420,
        mode: 'static_pages',
        uptimeSeconds: 86400
      });
    }
    if (cleanUrl.endsWith('/api/traffic-light')) {
      const lights = {};
      staticData.specs.forEach(s => {
        lights[s.route] = { light: 'green', reason: '規格已穩定對齊 (Static Pages 展示模式)' };
      });
      return mockRes(lights);
    }
    if (cleanUrl.endsWith('/api/tickets')) {
      return mockRes([
        { id: '#TKT-1001', title: '會員積分折抵 API (LIFF)', status: 'APPROVED', urgency: 'HIGH', impact: 'MEDIUM' },
        { id: '#TKT-1002', title: 'LINE Pay 快捷結帳端點', status: 'IN_REVIEW', urgency: 'MEDIUM', impact: 'HIGH' }
      ]);
    }
    if (cleanUrl.includes('/api/jit/') || cleanUrl.includes('/api/mock/')) {
      const parts = cleanUrl.split('/');
      const route = parts[parts.length - 1];
      const mockPayload = staticData.mocks[route] || { success: true, message: 'JIT Static Response for ' + route };
      return mockRes({
        success: true,
        route,
        phase: 'phase3_frozen',
        executionTimeMs: 0.04,
        engineUsed: 'static_mock',
        data: mockPayload
      });
    }
    if (cleanUrl.endsWith('/api/benchmarks')) {
      return mockRes({
        vus: 10,
        qps: 18450,
        p95Ms: 0.08,
        p99Ms: 0.12,
        history: [12000, 15000, 18450]
      });
    }

    return origFetch.apply(this, arguments);
  };
})();
`;
    const runtimePath = path.join(outDir, 'jit-static-runtime.js');
    fs.writeFileSync(runtimePath, runtimeJs, 'utf-8');
    filesGenerated.push(runtimePath);

    // 5. Inject runtime script into index.html if present
    const indexPath = path.join(outDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      let indexHtml = fs.readFileSync(indexPath, 'utf-8');
      if (!indexHtml.includes('jit-static-runtime.js')) {
        indexHtml = indexHtml.replace('</head>', '  <script src="./jit-static-runtime.js"></script>\n</head>');
        fs.writeFileSync(indexPath, indexHtml, 'utf-8');
      }
    }

    // 6. Generate GitHub Pages Actions Workflow
    let workflowPath: string | undefined;
    if (options?.generateGithubWorkflow !== false) {
      const githubWorkflowDir = path.resolve(cwd, '.github/workflows');
      if (!fs.existsSync(githubWorkflowDir)) {
        fs.mkdirSync(githubWorkflowDir, { recursive: true });
      }
      workflowPath = path.join(githubWorkflowDir, 'deploy-pages.yml');
      const workflowContent = `name: Deploy JIT Web Studio to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci || npm install

      - name: Compile TypeScript
        run: npm run build

      - name: Build static bundle
        run: node bin/cli.js export pages --out dist-pages

      - name: Setup Pages
        uses: actions/configure-pages@v4
        with:
          enablement: true

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'dist-pages'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
      fs.writeFileSync(workflowPath, workflowContent, 'utf-8');
      filesGenerated.push(workflowPath);
    }

    return {
      outDir,
      specCount: specs.length,
      filesGenerated,
      workflowPath,
    };
  }

  private static copyDirRecursive(src: string, dest: string, recorded: string[]) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        StaticPagesExporter.copyDirRecursive(srcPath, destPath, recorded);
      } else {
        fs.copyFileSync(srcPath, destPath);
        recorded.push(destPath);
      }
    }
  }
}
