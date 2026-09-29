/**
 * JIT Protocol Synthesis Framework - OpenAPI 3.0 Specification Exporter
 * 
 * Automatically translates Markdown specs (## Fields, ## Mock, ## Auth)
 * into a standard OpenAPI 3.0.3 JSON document for Swagger, Postman, and API gateways.
 */

import fs from 'fs';
import path from 'path';
import { MDParser } from '../core/md_parser.js';

export interface OpenAPIExportOptions {
  specsDir?: string;
  outFile?: string;
  title?: string;
  version?: string;
  serverUrl?: string;
}

export class OpenAPIExporter {
  public static export(options?: OpenAPIExportOptions): Record<string, any> {
    const cwd = process.cwd();
    const specsDir = path.resolve(cwd, options?.specsDir || './specs');

    const openapi: Record<string, any> = {
      openapi: '3.0.3',
      info: {
        title: options?.title || 'JIT Protocol Synthesis API',
        version: options?.version || '1.4.1',
        description: 'Auto-generated OpenAPI 3.0 document from JIT Markdown specifications',
      },
      servers: [
        {
          url: options?.serverUrl || 'http://localhost:3000',
          description: 'JIT API Gateway',
        },
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
    };

    if (fs.existsSync(specsDir)) {
      const files = fs.readdirSync(specsDir).filter((f) => f.endsWith('.api.md') || f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(specsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = MDParser.parse(content, file);
          const route = parsed.route;
          const pathKey = `/api/jit/${route}`;

          // Map fields to JSON Schema properties
          const properties: Record<string, any> = {};
          const requiredFields: string[] = [];

          for (const fdef of parsed.fields || []) {
            const fname = fdef.name;
            const prop: Record<string, any> = {
              type: fdef.type === 'enum' ? 'string' : (fdef.type || 'string'),
              description: fdef.description || '',
            };
            if (fdef.enumValues) {
              prop.enum = Object.keys(fdef.enumValues);
            }
            properties[fname] = prop;
            const isRequired = !fdef.description || /required|必填/i.test(fdef.description);
            if (isRequired) {
              requiredFields.push(fname);
            }
          }

          const schemaName = `${route.replace(/[^a-zA-Z0-9]/g, '_')}_Request`;
          openapi.components.schemas[schemaName] = {
            type: 'object',
            properties,
            required: requiredFields.length > 0 ? requiredFields : undefined,
            example: parsed.samplePayload || {},
          };

          const operation: Record<string, any> = {
            summary: parsed.description || `Execute ${route}`,
            description: parsed.intentCriteria || `JIT Dynamic-to-Static endpoint for ${route}`,
            operationId: route,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    $ref: `#/components/schemas/${schemaName}`,
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Successful execution',
                content: {
                  'application/json': {
                    example: {
                      success: true,
                      route,
                      phase: 'phase3_frozen',
                      executionTimeMs: 0.04,
                      data: parsed.mockResponse || parsed.samplePayload || { status: 'ok' },
                    },
                  },
                },
              },
              '400': {
                description: 'Validation or Schema Drift Error',
              },
            },
          };

          if (parsed.auth && parsed.auth.type !== 'none') {
            operation.security = [
              parsed.auth.type === 'bearer' ? { BearerAuth: [] } : { ApiKeyAuth: [] },
            ];
          }

          openapi.paths[pathKey] = {
            post: operation,
          };
        } catch (err) {
          console.warn(`[OpenAPIExporter] Skipping ${file}:`, err);
        }
      }
    }

    if (options?.outFile) {
      const outPath = path.resolve(cwd, options.outFile);
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(openapi, null, 2), 'utf-8');
    }

    return openapi;
  }
}
