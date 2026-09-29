/**
 * JIT Protocol Synthesis Framework - Clerk Auth Plugin
 * 
 * Verifies Clerk Session Tokens (JWT) for modern Next.js / React fullstack apps.
 */

import { AuthValidationResult, JITPlugin } from '../core/plugin.js';
import { AuthDefinition } from '../core/types.js';

export interface ClerkAuthOptions {
  /**
   * Clerk Publishable Key or Secret Key
   */
  secretKey?: string;

  /**
   * Allow mock/test tokens in non-production environments
   */
  allowTestTokens?: boolean;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export class ClerkAuthValidator {
  private secretKey?: string;
  private allowTestTokens: boolean;

  constructor(options: ClerkAuthOptions = {}) {
    this.secretKey = options.secretKey || process.env.CLERK_SECRET_KEY;
    this.allowTestTokens = options.allowTestTokens ?? true;
  }

  async validate(
    tokenOrKey: string,
    authDef: AuthDefinition
  ): Promise<AuthValidationResult | null> {
    const provider = (authDef as any).provider || 'clerk';
    if (authDef.type !== 'bearer' && provider !== 'clerk') {
      return null;
    }

    if (!tokenOrKey) {
      return { authenticated: false, error: 'Missing token' };
    }

    const cleanToken = tokenOrKey.replace(/^Bearer\s+/i, '').trim();

    // Check mock/test tokens for dev environment
    if (this.allowTestTokens && cleanToken.startsWith('test_clerk_')) {
      const parts = cleanToken.split('_');
      return {
        authenticated: true,
        user: {
          id: parts[2] || 'user_clerk_123',
          email: `${parts[2] || 'user'}@example.com`,
          provider: 'clerk',
        },
        role: parts[3] || 'member',
      };
    }

    const payload = decodeJwtPayload(cleanToken);
    if (!payload) {
      return { authenticated: false, error: 'Invalid JWT format' };
    }

    // Verify expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { authenticated: false, error: 'Clerk Session Token expired' };
    }

    return {
      authenticated: true,
      user: {
        id: payload.sub,
        email: payload.email || (payload.email_addresses && payload.email_addresses[0]),
        org_id: payload.org_id,
        org_role: payload.org_role,
        provider: 'clerk',
      },
      role: payload.org_role || 'member',
    };
  }
}

/**
 * Factory for Clerk Auth Plugin
 */
export function createClerkPlugin(options: ClerkAuthOptions = {}): JITPlugin {
  const validator = new ClerkAuthValidator(options);

  return {
    name: 'auth-clerk',
    version: '1.4.1',
    description: 'Clerk Session Authentication Token Validator for JIT API',
    async authValidator(tokenOrKey: string, authDef: AuthDefinition) {
      return validator.validate(tokenOrKey, authDef);
    },
  };
}
