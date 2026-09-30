/**
 * Markdown API Specification Parser
 * 
 * Converts human-friendly Markdown API specs into JIT RouteDefinitions.
 */

import vm from 'node:vm';
import {
  RouteDefinition,
  JITRequestContext,
  AuthDefinition,
  UpstreamDefinition,
  RateLimitDefinition,
  NotifyDefinition,
  PromptArgument,
  CompositionDefinition,
} from './types.js';

export interface ParsedMDField {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
  enumValues?: Record<string, string>;
  synonyms?: Record<string, string[]>;
}

export interface ParsedMDResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  logicCode?: string;
  filename?: string;
}

export interface ParsedMDPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
  template: string;
  filename?: string;
}

export interface ParsedMDSpec {
  route: string;
  version?: string;
  stage?: 'dev' | 'prod';
  auth?: AuthDefinition;
  upstream?: UpstreamDefinition;
  rateLimit?: RateLimitDefinition;
  notify?: NotifyDefinition;
  composition?: CompositionDefinition;
  synonymMap?: Record<string, string>;
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
    let upstream: UpstreamDefinition | undefined;
    let rateLimit: RateLimitDefinition | undefined;
    let notify: NotifyDefinition | undefined;
    let composition: CompositionDefinition | undefined;
    const synonymMap: Record<string, string> = {};
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
        const typeMatch = trimmed.match(/^(?:-\s*)?type\s*:\s*([a-zA-Z0-9_\-]+)/i);
        if (typeMatch) {
          const rawType = typeMatch[1].toLowerCase();
          auth.type = rawType;
          continue;
        }
        const providerMatch = trimmed.match(/^(?:-\s*)?provider\s*:\s*([a-zA-Z0-9_\-]+)/i);
        if (providerMatch) {
          auth.provider = providerMatch[1].trim().toLowerCase();
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

      // Handle Section: Upstream
      if (currentSection === 'upstream') {
        if (!upstream) upstream = { targetUrl: '' };
        const urlMatch = trimmed.match(/^(?:-\s*)?(?:targeturl|url)\s*:\s*(.+)/i);
        if (urlMatch) {
          upstream.targetUrl = urlMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const methodMatch = trimmed.match(/^(?:-\s*)?method\s*:\s*([a-zA-Z]+)/i);
        if (methodMatch) {
          upstream.method = methodMatch[1].trim().toUpperCase() as any;
          continue;
        }
        const secretMatch = trimmed.match(/^(?:-\s*)?(?:secretref|secret)\s*:\s*(.+)/i);
        if (secretMatch) {
          upstream.secretRef = secretMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const cacheMatch = trimmed.match(/^(?:-\s*)?(?:cachettlseconds|cachettl|cache)\s*:\s*(\d+)/i);
        if (cacheMatch) {
          upstream.cacheTtlSeconds = parseInt(cacheMatch[1], 10);
          continue;
        }
        const timeoutMatch = trimmed.match(/^(?:-\s*)?(?:timeoutms|timeout)\s*:\s*(\d+)/i);
        if (timeoutMatch) {
          upstream.timeoutMs = parseInt(timeoutMatch[1], 10);
          continue;
        }
        const retryMatch = trimmed.match(/^(?:-\s*)?retry\s*:\s*(.+)/i);
        if (retryMatch) {
          const raw = retryMatch[1].trim();
          try {
            if (raw.startsWith('{')) {
              const jsonStr = raw.replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
              upstream.retry = JSON.parse(jsonStr);
            } else if (!isNaN(Number(raw))) {
              upstream.retry = { maxRetries: Number(raw), backoffMs: 300 };
            }
          } catch {}
          continue;
        }
        const cbMatch = trimmed.match(/^(?:-\s*)?(?:circuitbreaker|breaker)\s*:\s*(.+)/i);
        if (cbMatch) {
          const raw = cbMatch[1].trim();
          try {
            if (raw.startsWith('{')) {
              const jsonStr = raw.replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
              upstream.circuitBreaker = JSON.parse(jsonStr);
            }
          } catch {}
          continue;
        }
        const fallbackMatch = trimmed.match(/^(?:-\s*)?(?:fallbackmock|fallback)\s*:\s*(.+)/i);
        if (fallbackMatch) {
          const raw = fallbackMatch[1].trim();
          try {
            upstream.fallbackMock = JSON.parse(raw);
          } catch {
            upstream.fallbackMock = raw;
          }
          continue;
        }
      }

      // Handle Section: Compose (Parallel & Aggregator)
      if (currentSection === 'compose') {
        if (!composition) composition = {};
        if (trimmed.match(/^(?:-\s*)?parallel\s*:/i)) {
          composition.parallel = composition.parallel || {};
          continue;
        }
        const callMatch = trimmed.match(/^-\s*([a-zA-Z0-9_]+)\s*:\s*call\s*\(\s*([a-zA-Z0-9_\-]+)\s*(?:,\s*(\{.*?\}))?\s*\)/i);
        if (callMatch) {
          composition.parallel = composition.parallel || {};
          const subKey = callMatch[1];
          const subRoute = callMatch[2];
          let payloadMapping: any;
          if (callMatch[3]) {
            try {
              const relaxed = callMatch[3].replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
              payloadMapping = JSON.parse(relaxed);
            } catch {
              payloadMapping = undefined;
            }
          }
          composition.parallel[subKey] = {
            route: subRoute,
            payloadMapping,
          };
          continue;
        }
        const postProcessMatch = trimmed.match(/^(?:-\s*)?postprocess\s*:\s*(.+)/i);
        if (postProcessMatch) {
          composition.postProcessCode = postProcessMatch[1].trim();
          continue;
        }
      }

      // Handle Section: Limits or RateLimit
      if (currentSection === 'limits' || currentSection === 'ratelimit') {
        if (!rateLimit) rateLimit = { windowSeconds: 60, maxRequests: 60 };
        const windowMatch = trimmed.match(/^(?:-\s*)?(?:windowseconds|window)\s*:\s*(\d+)/i);
        if (windowMatch) {
          rateLimit.windowSeconds = parseInt(windowMatch[1], 10);
          continue;
        }
        const maxMatch = trimmed.match(/^(?:-\s*)?(?:maxrequests|max|limit|rate)\s*:\s*(\d+)/i);
        if (maxMatch) {
          rateLimit.maxRequests = parseInt(maxMatch[1], 10);
          continue;
        }
        const quotaMatch = trimmed.match(/^(?:-\s*)?(?:dailyquota|daily|quota)\s*:\s*(\d+)/i);
        if (quotaMatch) {
          rateLimit.dailyQuota = parseInt(quotaMatch[1], 10);
          continue;
        }
      }

      // Handle Section: Notify or Relay or Forward
      if (currentSection === 'notify' || currentSection === 'relay' || currentSection === 'forward') {
        if (!notify) notify = { target: '', channel: 'line' };
        const channelMatch = trimmed.match(/^(?:-\s*)?channel\s*:\s*([a-zA-Z0-9_\-]+)/i);
        if (channelMatch) {
          notify.channel = channelMatch[1].trim().toLowerCase();
          continue;
        }
        const targetMatch = trimmed.match(/^(?:-\s*)?target\s*:\s*(.+)/i);
        if (targetMatch) {
          notify.target = targetMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const conditionMatch = trimmed.match(/^(?:-\s*)?condition\s*:\s*(.+)/i);
        if (conditionMatch) {
          notify.condition = conditionMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const templateMatch = trimmed.match(/^(?:-\s*)?template\s*:\s*(.+)/i);
        if (templateMatch) {
          notify.template = templateMatch[1].trim().replace(/^["']|["']$/g, '');
          continue;
        }
        const tokenMatch = trimmed.match(/^(?:-\s*)?(?:tokenenv|token)\s*:\s*(.+)/i);
        if (tokenMatch) {
          const raw = tokenMatch[1].trim().replace(/^["']|["']$/g, '');
          if (raw.startsWith('env.') || /^[A-Z0-9_]+$/.test(raw)) {
            notify.tokenEnv = raw.replace(/^env\./, '');
          } else {
            notify.token = raw;
          }
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
        // Table row support: | 欄位名稱 | 型態 | 說明 |
        const tableRowMatch = trimmed.match(/^\|\s*([a-zA-Z0-9_]+)\s*\|\s*([a-zA-Z0-9_]+)\s*\|\s*(.*?)\s*\|?$/);
        if (tableRowMatch && !/^(?:欄位|field|name|-+)/i.test(tableRowMatch[1])) {
          const fieldName = tableRowMatch[1].trim();
          const fieldType = tableRowMatch[2].trim().toLowerCase();
          const fieldDesc = tableRowMatch[3].trim();
          const isOpt = /(?:選填|optional|\(選填\))/i.test(fieldDesc);

          currentField = {
            name: fieldName,
            type: fieldType,
            description: fieldDesc,
            optional: isOpt,
          };
          if (fieldType === 'enum') {
            currentField.enumValues = {};
            enumFields[fieldName] = currentField.enumValues;
          }
          fields.push(currentField);
          continue;
        }

        const isSubBullet = /^\s+-\s+/.test(rawLine);

        // Sub-bullet point for enum values:   - VALUE: description [同義詞: A, B] or   - VALUE
        if (isSubBullet && currentField && currentField.type === 'enum' && currentField.enumValues) {
          const enumMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?/);
          if (enumMatch) {
            const val = enumMatch[1];
            let desc = enumMatch[2] ? enumMatch[2].trim() : val;

            const synMatch = desc.match(/\[(?:同義詞|synonyms?)\s*:\s*([^\]]+)\]/i);
            if (synMatch) {
              const synList = synMatch[1].split(/[,，、]+/).map((s) => s.trim()).filter(Boolean);
              if (!currentField.synonyms) currentField.synonyms = {};
              currentField.synonyms[val] = synList;
              for (const s of synList) {
                synonymMap[s] = val;
              }
              desc = desc.replace(synMatch[0], '').trim();
            }

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
            optional: /(?:選填|optional|\(選填\))/i.test(fieldDesc),
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
      upstream,
      rateLimit,
      notify,
      composition,
      synonymMap: Object.keys(synonymMap).length > 0 ? synonymMap : undefined,
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
      // Wrap code in strict IIFE to keep `this` undefined and prevent top-level scope escape
      const wrappedCode = `(async function() {\n  "use strict";\n${spec.logicCode}\n})()`;

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
          tenant: ctx.tenant,
        };

        // Create root sandbox with null prototype to eliminate host Object.prototype inheritance
        const sandbox: Record<string, any> = Object.create(null);

        const context = vm.createContext(sandbox, {
          codeGeneration: {
            strings: false, // Disallow eval() and new Function()
            wasm: false,
          },
        });

        // Deserialize safePayload and safeCtx into the context's internal realm
        // so their prototypes belong to the VM realm rather than the host realm
        try {
          const realmJsonParse = vm.runInContext('JSON.parse', context);
          sandbox.payload = realmJsonParse(JSON.stringify(safePayload));
          sandbox.ctx = realmJsonParse(JSON.stringify(safeCtx));
        } catch {
          sandbox.payload = safePayload;
          sandbox.ctx = safeCtx;
        }

        // Host console with stripped prototype
        const safeConsole = Object.setPrototypeOf({
          log: (...args: any[]) => console.log(`[Sandbox:${spec.route}]`, ...args),
          warn: (...args: any[]) => console.warn(`[Sandbox:${spec.route}]`, ...args),
          error: (...args: any[]) => console.error(`[Sandbox:${spec.route}]`, ...args),
        }, null);
        sandbox.console = safeConsole;

        // Upstream fetch bridge with stripped prototype
        if (ctx.upstreamFetch) {
          const safeFetch = async (...args: any[]) => {
            return await ctx.upstreamFetch!(...(args as [string, any]));
          };
          Object.setPrototypeOf(safeFetch, null);
          sandbox.upstreamFetch = safeFetch;
        }

        // Explicitly block dangerous globals
        sandbox.process = undefined;
        sandbox.require = undefined;
        sandbox.import = undefined;
        sandbox.global = undefined;
        sandbox.globalThis = undefined;

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
    } else if (spec.composition && spec.composition.parallel) {
      handler = async (payload: any, ctx: JITRequestContext) => {
        const results: Record<string, any> = {};
        const entries = Object.entries(spec.composition!.parallel!);

        await Promise.all(
          entries.map(async ([key, subCall]) => {
            const subPayload = subCall.payloadMapping
              ? typeof subCall.payloadMapping === 'function'
                ? subCall.payloadMapping(payload)
                : Object.fromEntries(
                    Object.entries(subCall.payloadMapping).map(([k, pathOrVal]) => {
                      if (typeof pathOrVal === 'string' && pathOrVal.startsWith('payload.')) {
                        return [k, payload[pathOrVal.slice(8)]];
                      }
                      return [k, pathOrVal];
                    })
                  )
              : payload;

            const engine = (ctx as any).engine;
            if (engine && typeof engine.execute === 'function') {
              const res = await engine.execute({ ...subPayload, route: subCall.route }, subCall.route);
              results[key] = res.data;
            } else {
              results[key] = { executed: true, route: subCall.route, payload: subPayload };
            }
          })
        );

        return {
          status: 'COMPOSED',
          route: spec.route,
          composedData: results,
        };
      };
    } else if (spec.upstream && spec.upstream.targetUrl) {
      handler = async (payload: any, ctx: JITRequestContext) => {
        if (ctx.upstreamFetch) {
          return await ctx.upstreamFetch(spec.upstream!.targetUrl, {
            method: spec.upstream!.method || 'GET',
            body: payload,
            variables: payload,
            secretRef: spec.upstream!.secretRef,
            cacheTtlSeconds: spec.upstream!.cacheTtlSeconds,
            timeoutMs: spec.upstream!.timeoutMs,
            retry: spec.upstream!.retry,
            circuitBreaker: spec.upstream!.circuitBreaker,
            fallbackMock: spec.upstream!.fallbackMock,
          });
        }
        return {
          proxy: 'upstream_configured',
          targetUrl: spec.upstream!.targetUrl,
          payload,
        };
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
      upstream: spec.upstream,
      rateLimit: spec.rateLimit,
      notify: spec.notify,
      composition: spec.composition,
      synonymMap: spec.synonymMap,
      description: spec.description,
      intentCriteria: spec.intentCriteria,
      samplePayload: spec.samplePayload,
      sampleSemantic: spec.sampleSemantic,
      enumFields: Object.keys(spec.enumFields).length > 0 ? spec.enumFields : undefined,
      handler,
    };
  }

  /**
   * Detect whether markdown content is an API, Resource, or Prompt spec
   */
  public static detectType(content: string): 'api' | 'resource' | 'prompt' {
    const firstHeader = content.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('#'));
    if (!firstHeader) return 'api';
    if (/^#\s+Resource:\s*/i.test(firstHeader)) return 'resource';
    if (/^#\s+Prompt:\s*/i.test(firstHeader)) return 'prompt';
    return 'api';
  }

  /**
   * Parse Markdown Resource specification (# Resource: <uri>)
   */
  public static parseResource(markdown: string, filename?: string): ParsedMDResource {
    const lines = markdown.split(/\r?\n/);
    let uri = '';
    let name = '';
    let mimeType = 'application/json';
    let description = '';
    let logicCode: string | undefined;
    let inCodeBlock = false;
    const codeLines: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) {
        codeLines.push(rawLine);
        continue;
      }

      const resHeader = trimmed.match(/^#\s+Resource:\s*(.+)/i);
      if (resHeader) {
        uri = resHeader[1].trim();
        name = uri.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        continue;
      }

      if (trimmed.startsWith('>')) {
        const lineContent = trimmed.replace(/^>\s*/, '').trim();
        const mimeMatch = lineContent.match(/^MimeType\s*:\s*(.+)/i);
        if (mimeMatch) {
          mimeType = mimeMatch[1].trim();
          continue;
        }
        const descMatch = lineContent.match(/^Description\s*:\s*(.+)/i);
        if (descMatch) {
          description = descMatch[1].trim();
          continue;
        }
        if (!description) {
          description = lineContent;
        }
      }
    }

    if (!uri) {
      throw new Error('MDParser Error: Missing "# Resource: <uri>" in Markdown resource specification.');
    }

    if (codeLines.length > 0) {
      logicCode = codeLines.join('\n');
    }

    return {
      uri,
      name: name || uri,
      description: description || `Resource for ${uri}`,
      mimeType,
      logicCode,
      filename,
    };
  }

  /**
   * Parse Markdown Prompt specification (# Prompt: <name>)
   */
  public static parsePrompt(markdown: string, filename?: string): ParsedMDPrompt {
    const lines = markdown.split(/\r?\n/);
    let name = '';
    let description = '';
    const args: PromptArgument[] = [];
    let template = '';
    let currentSection = '';

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      const promptHeader = trimmed.match(/^#\s+Prompt:\s*([a-zA-Z0-9_\-]+)/i);
      if (promptHeader) {
        name = promptHeader[1].trim();
        continue;
      }

      if (trimmed.startsWith('>') && !currentSection) {
        const lineContent = trimmed.replace(/^>\s*/, '').trim();
        const descMatch = lineContent.match(/^Description\s*:\s*(.+)/i);
        description = descMatch ? descMatch[1].trim() : lineContent;
        continue;
      }

      const secMatch = trimmed.match(/^##\s+([a-zA-Z0-9_\s]+)/i);
      if (secMatch) {
        currentSection = secMatch[1].trim().toLowerCase();
        continue;
      }

      if (!trimmed) continue;

      if (currentSection === 'arguments' || currentSection === 'args') {
        const argMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)(?:\s*:\s*([a-zA-Z0-9_]+))?(?:\s*\((.*?)\))?/);
        if (argMatch) {
          const argName = argMatch[1];
          const argDesc = argMatch[3] || argMatch[2] || '';
          args.push({
            name: argName,
            description: argDesc,
            required: !/(?:選填|optional)/i.test(argDesc),
          });
        }
      } else if (currentSection === 'template') {
        template += (template ? '\n' : '') + rawLine;
      }
    }

    if (!name) {
      throw new Error('MDParser Error: Missing "# Prompt: <name>" in Markdown prompt specification.');
    }

    return {
      name,
      description: description || `Prompt template for ${name}`,
      arguments: args,
      template: template.trim(),
      filename,
    };
  }
}

