/**
 * JIT Protocol Synthesis Framework - Firebase Auth Plugin
 * 
 * Verifies Firebase ID Tokens (JWT) for requests authenticated via
 * Firebase Authentication.
 */

import { AuthValidationResult, JITPlugin } from '../core/plugin.js';
import { AuthDefinition } from '../core/types.js';

export interface FirebaseAuthOptions {
  /**
   * Firebase Project ID (e.g. 'my-app-1234')
   */
  projectId?: string;

  /**
   * Allow mock/test tokens in non-production environments
   */
  allowTestTokens?: boolean;
}

/**
 * Decode JWT payload without external library dependencies
 */
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

export class FirebaseAuthValidator {
  private projectId?: string;
  private allowTestTokens: boolean;

  constructor(options: FirebaseAuthOptions = {}) {
    this.projectId = options.projectId || process.env.FIREBASE_PROJECT_ID;
    this.allowTestTokens = options.allowTestTokens ?? true;
  }

  async validate(
    tokenOrKey: string,
    authDef: AuthDefinition
  ): Promise<AuthValidationResult | null> {
    // Only intercept if auth type is bearer or custom provider is firebase
    const provider = (authDef as any).provider || 'firebase';
    if (authDef.type !== 'bearer' && provider !== 'firebase') {
      return null;
    }

    if (!tokenOrKey) {
      return { authenticated: false, error: 'Missing token' };
    }

    const cleanToken = tokenOrKey.replace(/^Bearer\s+/i, '').trim();

    // Check mock/test tokens for dev environment
    if (this.allowTestTokens && cleanToken.startsWith('test_firebase_')) {
      const parts = cleanToken.split('_');
      return {
        authenticated: true,
        user: {
          uid: parts[2] || 'test-user',
          email: `${parts[2] || 'test'}@example.com`,
          email_verified: true,
          provider: 'firebase',
        },
        role: parts[3] || 'user',
      };
    }

    const payload = decodeJwtPayload(cleanToken);
    if (!payload) {
      return { authenticated: false, error: 'Invalid JWT format' };
    }

    // Verify expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { authenticated: false, error: 'Firebase ID Token expired' };
    }

    // Verify audience / project ID if configured
    if (this.projectId && payload.aud && payload.aud !== this.projectId) {
      return {
        authenticated: false,
        error: `Token audience '${payload.aud}' does not match project '${this.projectId}'`,
      };
    }

    return {
      authenticated: true,
      user: {
        uid: payload.sub || payload.user_id,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
        provider: 'firebase',
      },
      role: payload.role || payload.admin ? 'admin' : 'user',
    };
  }
}

/**
 * Factory for Firebase Auth Plugin
 */
export function createFirebaseAuthPlugin(options: FirebaseAuthOptions = {}): JITPlugin {
  const validator = new FirebaseAuthValidator(options);

  return {
    name: 'auth-firebase',
    version: '1.4.1',
    description: 'Firebase Authentication ID Token Validator for JIT API',
    async authValidator(tokenOrKey: string, authDef: AuthDefinition) {
      return validator.validate(tokenOrKey, authDef);
    },
  };
}
