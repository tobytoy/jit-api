/**
 * Markdown API Specification Parser
 * 
 * Converts human-friendly Markdown API specs into JIT RouteDefinitions.
 */

import { RouteDefinition, JITRequestContext } from './types.js';

export interface ParsedMDField {
  name: string;
  type: string;
  description?: string;
  enumValues?: Record<string, string>;
}

export interface ParsedMDSpec {
  route: string;
  description: string;
  intentCriteria: string;
  fields: ParsedMDField[];
  enumFields: Record<string, Record<string, string>>;
  logicCode?: string;
  mockResponse?: any;
}

export class MDParser {
  /**
   * Parses Markdown content into a structured ParsedMDSpec
   */
  public static parse(markdown: string): ParsedMDSpec {
    const lines = markdown.split(/\r?\n/);
    let route = '';
    let description = '';
    let intentCriteria = '';
    const fields: ParsedMDField[] = [];
    const enumFields: Record<string, Record<string, string>> = {};
    let logicCode: string | undefined;
    let mockResponse: any = undefined;

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
          }
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockLines.push(rawLine);
        continue;
      }

      // 1. # API: {name}
      const apiHeaderMatch = trimmed.match(/^#\s+(?:API:\s*)?([a-zA-Z0-9_\-]+)/i);
      if (apiHeaderMatch && !currentSection) {
        route = apiHeaderMatch[1];
        continue;
      }

      // 2. > {description}
      if (trimmed.startsWith('>') && !currentSection) {
        description = trimmed.replace(/^>\s*/, '').trim();
        continue;
      }

      // 3. Section headers: ## Intent, ## Fields, ## Logic, ## Mock
      const sectionMatch = trimmed.match(/^##\s+([a-zA-Z0-9_\s]+)/i);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim().toLowerCase();
        currentField = null;
        continue;
      }

      if (!trimmed) continue;

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
        // Bullet point: - name: type (comment)
        const fieldMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)(?:\s*\((.*?)\))?/);
        if (fieldMatch) {
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

        // Sub-bullet point for enum values: - VALUE: description or - VALUE
        if (currentField && currentField.type === 'enum' && currentField.enumValues) {
          const enumMatch = trimmed.match(/^-\s+([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?/);
          if (enumMatch) {
            const val = enumMatch[1];
            const desc = enumMatch[2] ? enumMatch[2].trim() : val;
            currentField.enumValues[val] = desc;
            continue;
          }
        }
      }
    }

    if (!route) {
      throw new Error('MDParser Error: Missing "# API: <name>" in Markdown specification.');
    }

    return {
      route,
      description: description || `Handler for ${route}`,
      intentCriteria: intentCriteria || description || route,
      fields,
      enumFields,
      logicCode,
      mockResponse,
    };
  }

  /**
   * Converts ParsedMDSpec into a live executable RouteDefinition
   */
  public static toRouteDefinition(spec: ParsedMDSpec): RouteDefinition {
    let handler: (payload: any, ctx: JITRequestContext) => Promise<any>;

    if (spec.logicCode) {
      // Safely construct an async handler function
      try {
        const fn = new Function('payload', 'ctx', `
          return (async () => {
            ${spec.logicCode}
          })();
        `);
        handler = async (payload: any, ctx: JITRequestContext) => {
          return await fn(payload, ctx);
        };
      } catch (err: any) {
        console.warn(`[MDParser] Failed to compile logic code for ${spec.route}, falling back to mock:`, err.message);
        handler = async (payload: any, ctx: JITRequestContext) => {
          return {
            ...spec.mockResponse,
            _payload: payload,
            _phase: ctx.phase,
          };
        };
      }
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
      description: spec.description,
      intentCriteria: spec.intentCriteria,
      enumFields: Object.keys(spec.enumFields).length > 0 ? spec.enumFields : undefined,
      handler,
    };
  }
}
