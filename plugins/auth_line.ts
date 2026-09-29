/**
 * JIT Protocol Synthesis Framework - LINE Auth Plugin
 * 
 * Validates LINE LIFF ID Tokens & Access Tokens for LINE Mini App integration.
 */

import { JITPlugin, AuthValidationResult } from '../core/plugin.js';
import { AuthDefinition } from '../core/types.js';
import { decodeJwtPayload } from './auth_supabase.js';

export interface LineAuthPluginOptions {
  channelId?: string;
  allowMockTokens?: boolean;
}

export function createLineAuthPlugin(options?: LineAuthPluginOptions): JITPlugin {
  return {
    name: 'line-auth',
    version: '1.4.1',
    description: 'LINE LIFF ID Token & User Authentication Plugin',

    authValidator: async (
      tokenOrKey: string,
      authDef: AuthDefinition,
      req?: any
    ): Promise<AuthValidationResult | null> => {
      const isTargeted =
        authDef.type === 'line' ||
        authDef.provider === 'line' ||
        (authDef.type === 'bearer' && authDef.options?.provider === 'line');

      if (!isTargeted) {
        return null;
      }

      const token = tokenOrKey.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return {
          authenticated: false,
          error: 'LINE Auth: Missing or empty token',
        };
      }

      // Check mock token in test/dev environment if allowed
      if (options?.allowMockTokens && token.startsWith('mock_line_')) {
        const userId = token.replace('mock_line_', '');
        return {
          authenticated: true,
          user: {
            id: userId,
            displayName: `Mock LINE User (${userId})`,
            pictureUrl: 'https://example.com/avatar.png',
          },
          role: 'line_user',
        };
      }

      const payload = decodeJwtPayload(token);
      if (!payload) {
        return {
          authenticated: false,
          error: 'LINE Auth: Invalid token format',
        };
      }

      // Validate issuer
      if (payload.iss && payload.iss !== 'https://access.line.me') {
        return {
          authenticated: false,
          error: `LINE Auth: Invalid issuer '${payload.iss}', expected 'https://access.line.me'`,
        };
      }

      // Validate channel ID if provided
      const expectedAud = authDef.options?.channelId || options?.channelId;
      if (expectedAud && payload.aud && payload.aud !== expectedAud) {
        return {
          authenticated: false,
          error: `LINE Auth: Channel ID mismatch. Expected '${expectedAud}', got '${payload.aud}'`,
        };
      }

      // Validate expiry
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return {
          authenticated: false,
          error: 'LINE Auth: Token has expired',
        };
      }

      const user = {
        id: payload.sub,
        displayName: payload.name || payload.displayName,
        pictureUrl: payload.picture || payload.pictureUrl,
        email: payload.email,
      };

      return {
        authenticated: true,
        user,
        role: 'line_user',
      };
    },
  };
}
