/**
 * Markdown API Specification Parser
 * 
 * Converts human-friendly Markdown API specs into JIT RouteDefinitions.
 */

import vm from 'node:vm';
import { RouteDefinition, JITRequestContext, AuthDefinition } from './types.js';

export interface ParsedMDField {
  name: string;
  type: string;
  description?: string;
  enumValues?: Record<string, string>;
}

export interface ParsedMDSpec {
  route: string;
  version?: string;
  stage?: 'dev' | 'prod';
  auth?: AuthDefinition;
  description: string;
  intentCriteria: string;
  fields: ParsedMDField[];
  enumFields: Record<string, Record<string, string>>;
  logicCode?: string;
  logicStartLine?: number;
  filename?: string;
  mockResponse?: any;
  samplePayload?: Record<string, any>;
  sampleSemantic?: string;
}

export class MDParser {
  /**
   * Automatically derive a smart fallback sample payload from fields
   */
  public static deriveFallbackSample(
    fields: ParsedMDField[],
    enumFields: Record<string, Record<string, string>>
  ): Record<string, any> {
    const payload: Record<string, any> = {};
    for (const f of fields) {
      const lowerName = f.name.toLowerCase();
      if (f.type === 'number') {
        if (lowerName.includes('amount') || lowerName.includes('price') || lowerName.includes('fee')) {
          payload[f.name] = 1000;
        } else if (lowerName.includes('count') || lowerName.includes('qty') || lowerName.includes('quantity')) {
          payload[f.name] = 2;
        } else {
          payload[f.name] = 100;
        }
      } else if (f.type === 'boolean') {
        payload[f.name] = true;
      } else if (f.type === 'enum') {
        const enums = enumFields[f.name] || f.enumValues;
        if (enums && Object.keys(enums).length > 0) {
          payload[f.name] = Object.keys(enums)[0];
        } else {
          payload[f.name] = 'DEFAULT';
        }
      } else {
        // string or unknown
        if (lowerName.includes('email') || lowerName.includes('mail')) {
          payload[f.name] = 'user@example.com';
        } else if (lowerName.includes('id')) {
          payload[f.name] = `${f.name.toUpperCase()}-1001`;
        } else if (lowerName.includes('reason')) {
          payload[f.name] = '測試原因說明';
        } else if (lowerName.includes('item') || lowerName.includes('product') || lowerName.includes('name')) {
          payload[f.name] = '測試範例項目';
        } else {
          payload[f.name] = `sample_${f.name}`;
        }
      }
    }
    return payload;
  }

  /**
   * Parses Markdown content into a structured ParsedMDSpec
   */
  public static parse(markdown: string, filename?: string): ParsedMDSpec {
    const lines = markdown.split(/\r?\n/);
    let route = '';
    let version: string | undefined;
    let stage: 'dev' | 'prod' = 'dev';
    let auth: AuthDefinition | undefined;
    let description = '';
    let intentCriteria = '';
    const fields: ParsedMDField[] = [];
    const enumFields: Record<string, Record<string, string>> = {};
    let logicCode: string | undefined;
    let logicStartLine: number | undefined;
    let mockResponse: any = undefined;
    let samplePayload: Record<string, any> | undefined;
    let sampleSemantic: string | undefined;

    let currentSection = '';
    let currentField: ParsedMDField | null = null;
    let codeBlockLang = '';
    let codeBlockLines: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Check code block fences
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = trimmed.replace('```', '').trim().toLowerCase();
          codeBlockLines = [];
          if (currentSection === 'logic') {
            logicStartLine = i + 2; // Line where code starts (1-indexed)
          }
          continue;
        } else {
          inCodeBlock = false;
          const codeContent = codeBlockLines.join('\n');
          if (currentSection === 'logic') {
            logicCode = codeContent;
          } else if (currentSection === 'mock') {
            try {
              mockResponse = JSON.parse(codeContent);
            } catch {
              mockResponse = codeContent;
            }
          } else if (currentSection === 'sample' || currentSection === 'test') {
            try {
              samplePayload = JSON.parse(codeContent);
            } catch {
              // ignore invalid json in sample code block
            }
          }
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockLines.push(rawLine);
        continue;
      }

      // Metadata before sections or in header
      // 1. # API: {name}
      const apiHeaderMatch = trimmed.match(/^#\s+(?:API:\s*)?([a-zA-Z0-9_\-]+)/i);
      if (apiHeaderMatch && !currentSection) {
        route = apiHeaderMatch[1];
        continue;
      }

      // 2. Version: 1.0.0 or version: 1.0.0
      const versionMatch = trimmed.match(/^(?:version|ver)\s*:\s*([0-9a-zA-Z\.\-]+)/i);
      if (versionMatch && !currentSection) {
        version = versionMatch[1];
        continue;
      }

      // 3. Stage: dev | prod or status: draft | published
      const stageMatch = trimmed.match(/^(?:stage|status|env)\s*:\s*([a-zA-Z]+)/i);
      if (stageMatch && !currentSection) {
        const val = stageMatch[1].toLowerCase();
        stage = (val === 'prod' || val === 'production' || val === 'published') ? 'prod' : 'dev';
        continue;
      }

      // 4. > {description}
      if (trimmed.startsWith('>') && !currentSection) {
        description = trimmed.replace(/^>\s*/, '').trim();
        continue;
      }

      // 5. Section headers: ## Intent, ## Fields, ## Logic, ## Mock, ## Sample, ## Test, ## Auth
      const sectionMatch = trimmed.match(/^##\s+([a-zA-Z0-9_\s]+)/i);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim().toLowerCase();
        currentField = null;
        continue;
      }

      if (!trimmed) continue;

      // Handle Section: Auth
      if (currentSection === 'auth') {
        if (!auth) auth = { type: 'none' };
        const typeMatch = trimmed.match(/^(?:-\s*)?type\s*:\s*([a-zA-Z\-]+)/i);
        if (typeMatch) {
          const rawType = typeMatch[1].toLowerCase();
          auth.type = (rawType === 'bearer' || rawType === 'api-key') ? rawType : 'none';
          continue;
        }
        const headerMatch = trimmed.match(/^(?:-\s*)?header\s*:\s*([a-zA-Z0-9_\-]+)/i);
        if (headerMatch) {
          auth.header = headerMatch[1].trim();
          continue;
        }
        const tokenMatch = trimmed.match(/^(?:-\s*)?token\s*:\s*(.+)/i);
        if (tokenMatch) {
          auth.token = tokenMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const envMatch = trimmed.match(/^(?:-\s*)?(?:env|envvar)\s*:\s*([a-zA-Z0-9_]+)/i);
        if (envMatch) {
          auth.envVar = envMatch[1].trim();
          continue;
        }
      }

      // Handle Section: Intent
      if (currentSection === 'intent') {
        if (!intentCriteria) {
          intentCriteria = trimmed;
        } else {
          intentCriteria += ' ' + trimmed;
        }
        continue;
      }

      // Handle Section: Fields
      if (currentSection === 'fields') {
        const isSubBullet = /^\s+-\s+/.test(rawLine);

        // Sub-bullet point for enum values:   - VALUE: description or   - VALUE
        if (isSubBullet && currentField && currentField.type === 'enum' && currentField.enumValues) {
          const enumMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?/);
          if (enumMatch) {
            const val = enumMatch[1];
            const desc = enumMatch[2] ? enumMatch[2].trim() : val;
            currentField.enumValues[val] = desc;
            continue;
          }
        }

        // Top-level field bullet point: - name: type (comment)
        const fieldMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)(?:\s*\((.*?)\))?/);
        if (!isSubBullet && fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2].toLowerCase();
          const fieldDesc = fieldMatch[3] || '';

          currentField = {
            name: fieldName,
            type: fieldType,
            description: fieldDesc,
          };

          if (fieldType === 'enum') {
            currentField.enumValues = {};
            enumFields[fieldName] = currentField.enumValues;
          }

          fields.push(currentField);
          continue;
        }
      }

      // Handle Section: Sample or Test
      if (currentSection === 'sample' || currentSection === 'test') {
        // Check for semantic query: - Semantic: ... or - Message: ... or Semantic: ...
        const semanticMatch = trimmed.match(/^(?:-\s*)?(?:semantic|message|intent|query)\s*:\s*(.+)/i);
        if (semanticMatch) {
          sampleSemantic = semanticMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }

        // Check for inline payload: - Payload: { ... }
        const inlinePayloadMatch = trimmed.match(/^(?:-\s*)?payload\s*:\s*(\{.*\})/i);
        if (inlinePayloadMatch) {
          try {
            samplePayload = JSON.parse(inlinePayloadMatch[1]);
          } catch {
            // ignore
          }
          continue;
        }

        // If it's a plain quote or sentence and no semantic set yet
        if (!sampleSemantic && (trimmed.startsWith('>') || !trimmed.startsWith('-'))) {
          sampleSemantic = trimmed.replace(/^>\s*/, '').replace(/^["']|["']$/g, '');
        }
      }
    }

    if (!route) {
      throw new Error('MDParser Error: Missing "# API: <name>" in Markdown specification.');
    }

    // Smart Fallback for Sample if not declared
    if (!samplePayload && fields.length > 0) {
      samplePayload = MDParser.deriveFallbackSample(fields, enumFields);
    }
    if (!sampleSemantic) {
      sampleSemantic = description || `測試執行 ${route}`;
    }

    return {
      route,
      version: version || '1.0.0',
      stage,
      auth,
      description: description || `Handler for ${route}`,
      intentCriteria: intentCriteria || description || route,
      fields,
      enumFields,
      logicCode,
      logicStartLine,
      filename,
      mockResponse,
      samplePayload,
      sampleSemantic,
    };
  }

  /**
   * Converts ParsedMDSpec into a live executable RouteDefinition with node:vm Sandboxing
   */
  public static toRouteDefinition(spec: ParsedMDSpec): RouteDefinition {
    let handler: (payload: any, ctx: JITRequestContext) => Promise<any>;

    if (spec.logicCode) {
      const fileName = spec.filename || `${spec.route}.api.md`;
      const startLine = spec.logicStartLine || 1;
      const wrappedCode = `(async () => {\n${spec.logicCode}\n})()`;

      handler = async (payload: any, ctx: JITRequestContext) => {
        // Deep clone payload to prevent prototype pollution
        let safePayload: any;
        try {
          safePayload = JSON.parse(JSON.stringify(payload || {}));
        } catch {
          safePayload = { ...payload };
        }

        const safeCtx: JITRequestContext = {
          route: ctx.route,
          phase: ctx.phase,
          executionTimeMs: ctx.executionTimeMs,
          aiLatencyMs: ctx.aiLatencyMs,
          intentConfidence: ctx.intentConfidence,
          engineUsed: ctx.engineUsed,
          headers: ctx.headers ? { ...ctx.headers } : undefined,
        };

        const sandbox: Record<string, any> = {
          payload: safePayload,
          ctx: safeCtx,
          console: {
            log: (...args: any[]) => console.log(`[Sandbox:${spec.route}]`, ...args),
            warn: (...args: any[]) => console.warn(`[Sandbox:${spec.route}]`, ...args),
            error: (...args: any[]) => console.error(`[Sandbox:${spec.route}]`, ...args),
          },
          JSON,
          Math,
          Date,
          String,
          Number,
          Boolean,
          Array,
          Object,
          RegExp,
          parseInt,
          parseFloat,
          encodeURIComponent,
          decodeURIComponent,
          // Explicitly blocked critical globals
          process: undefined,
          require: undefined,
          import: undefined,
          global: undefined,
          globalThis: undefined,
        };

        const context = vm.createContext(sandbox, {
          codeGeneration: {
            strings: false, // Disallow eval() and new Function()
            wasm: false,
          },
        });

        try {
          const script = new vm.Script(wrappedCode, {
            filename: fileName,
            lineOffset: Math.max(0, startLine - 2),
          });

          // Run with timeout (3000ms) to kill infinite loops
          const promise = script.runInContext(context, { timeout: 3000 });
          return await promise;
        } catch (err: any) {
          const wrapped = new Error(`[Logic Error] ${spec.route} (${fileName}:${startLine}): ${err.message}`);
          if (err.stack) {
            wrapped.stack = err.stack;
          }
          throw wrapped;
        }
      };
    } else if (spec.mockResponse !== undefined) {
      handler = async (payload: any, ctx: JITRequestContext) => {
        return typeof spec.mockResponse === 'object' && spec.mockResponse !== null
          ? { ...spec.mockResponse, _echo: payload }
          : spec.mockResponse;
      };
    } else {
      handler = async (payload: any, ctx: JITRequestContext) => {
        return {
          status: 'PROCESSED',
          route: spec.route,
          data: payload,
          phase: ctx.phase,
          aiLatencyMs: ctx.aiLatencyMs,
        };
      };
    }

    return {
      route: spec.route,
      version: spec.version,
      stage: spec.stage,
      auth: spec.auth,
      description: spec.description,
      intentCriteria: spec.intentCriteria,
      samplePayload: spec.samplePayload,
      sampleSemantic: spec.sampleSemantic,
      enumFields: Object.keys(spec.enumFields).length > 0 ? spec.enumFields : undefined,
      handler,
    };
  }
}
