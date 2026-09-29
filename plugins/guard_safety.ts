/**
 * JIT Protocol Synthesis Framework - Safety Guardrail & PII Sanitizer Plugin
 * 
 * Provides:
 * 1. Prompt Injection & Jailbreak detection for Phase 1 LLM requests
 * 2. PII (Personally Identifiable Information) masking & sanitization
 *    (Phones, Emails, Credit Cards, National IDs)
 */

import { JITPlugin } from '../core/plugin.js';

export interface GuardrailCheckResult {
  passed: boolean;
  blockedReason?: string;
  sanitizedData?: any;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /dan\s+mode\s+enabled/i,
  /disregard\s+all\s+guardrails/i,
  /print\s+your\s+hidden\s+instructions/i,
  /\b(eval|exec)\s*\(/i,
  /<script\b[^>]*>([\s\S]*?)<\/script>/i,
];

/**
 * Check if text contains prompt injection or jailbreak attempts
 */
export function detectPromptInjection(text: string): {
  isSuspicious: boolean;
  pattern?: string;
} {
  if (typeof text !== 'string') return { isSuspicious: false };

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { isSuspicious: true, pattern: pattern.toString() };
    }
  }
  return { isSuspicious: false };
}

/**
 * Mask PII fields in a string
 */
export function maskPIIText(text: string): string {
  if (typeof text !== 'string') return text;

  let result = text;

  // 1. Email masking: user@domain.com -> u***@domain.com
  result = result.replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, '$1***@$2');

  // 2. Taiwan Phone numbers: 0912-345-678 or 0912345678 -> 0912-***-678
  result = result.replace(/(09\d{2})[- ]?(\d{3})[- ]?(\d{3})/g, '$1-***-$3');

  // 3. Taiwan National ID: A123456789 -> A123***789
  result = result.replace(/([A-Z][12]\d{2})\d{3}(\d{3})/g, '$1***$2');

  // 4. Credit Card numbers: 16 digits
  result = result.replace(/(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})/g, '$1-****-****-$4');

  return result;
}

/**
 * Recursively sanitize all PII in an object or primitive
 */
export function sanitizePII<T = any>(data: T): T {
  if (typeof data === 'string') {
    return maskPIIText(data) as any;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizePII(item)) as any;
  }
  if (data !== null && typeof data === 'object') {
    const copy: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      // Sensitive field names get completely masked
      if (/password|secret|token|apikey|cvv/i.test(key)) {
        copy[key] = '***REDACTED***';
      } else {
        copy[key] = sanitizePII(val);
      }
    }
    return copy as T;
  }
  return data;
}

/**
 * Factory for Safety Guardrail Plugin
 */
export function createSafetyGuardPlugin(options: { blockInjections?: boolean; autoSanitizePII?: boolean } = {}): JITPlugin {
  const blockInjections = options.blockInjections ?? true;
  const autoSanitize = options.autoSanitizePII ?? true;

  return {
    name: 'guard-safety',
    version: '1.4.1',
    description: 'AI Safety Guardrail & PII Masking Plugin for JIT API',
    async beforeRouteExecution(context) {
      if (blockInjections && context.payload) {
        const checkStr = (val: any): boolean => {
          if (typeof val === 'string') {
            return detectPromptInjection(val).isSuspicious;
          }
          if (Array.isArray(val)) {
            return val.some(checkStr);
          }
          if (val && typeof val === 'object') {
            return Object.values(val).some(checkStr);
          }
          return false;
        };

        if (checkStr(context.payload)) {
          return {
            proceed: false,
            error: 'AI Safety Guardrail: Prompt Injection or Jailbreak pattern detected.',
            statusCode: 400,
          };
        }
      }

      let modifiedPayload = context.payload;
      if (autoSanitize && context.payload) {
        modifiedPayload = sanitizePII(context.payload);
      }

      return {
        proceed: true,
        modifiedPayload,
      };
    },
  };
}
