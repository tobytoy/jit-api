/**
 * JIT Protocol Synthesis Framework - Supabase Auth Plugin
 * 
 * Provides Supabase JWT Token verification and user role extraction
 * for ## Auth: Bearer / ## Auth: Supabase.
 */

import { JITPlugin, AuthValidationResult } from '../core/plugin.js';
import { AuthDefinition } from '../core/types.js';

export interface SupabaseAuthPluginOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  jwtSecret?: string;
  requiredRole?: string;
}

/**
 * Lightweight helper to decode JWT payload without external binary dependency
 */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Factory for Supabase Auth Plugin
 */
export function createSupabaseAuthPlugin(options?: SupabaseAuthPluginOptions): JITPlugin {
  return {
    name: 'supabase-auth',
    version: '1.4.1',
    description: 'Supabase JWT authentication & role extraction plugin',

    authValidator: async (
      tokenOrKey: string,
      authDef: AuthDefinition,
      req?: any
    ): Promise<AuthValidationResult | null> => {
      // Check if this auth definition is targeted for Supabase or general Bearer
      const isTargeted =
        authDef.type === 'supabase' ||
        authDef.provider === 'supabase' ||
        (authDef.type === 'bearer' && (options?.supabaseUrl || options?.jwtSecret));

      if (!isTargeted) {
        return null; // Let standard or other plugins handle
      }

      // Extract raw token from Bearer prefix if present
      const token = tokenOrKey.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return {
          authenticated: false,
          error: 'Supabase Auth: Empty token provided',
        };
      }

      const payload = decodeJwtPayload(token);
      if (!payload) {
        return {
          authenticated: false,
          error: 'Supabase Auth: Invalid JWT token format',
        };
      }

      // Check token expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return {
          authenticated: false,
          error: 'Supabase Auth: Token has expired',
        };
      }

      // Check required role if specified in options or auth definition
      const requiredRole = authDef.options?.role || options?.requiredRole;
      const userRole = payload.role || payload.app_metadata?.role || 'authenticated';

      if (requiredRole && userRole !== requiredRole) {
        return {
          authenticated: false,
          role: userRole,
          error: `Supabase Auth: Forbidden. Required role '${requiredRole}', but user has role '${userRole}'`,
        };
      }

      const user = {
        id: payload.sub || payload.id,
        email: payload.email,
        role: userRole,
        appMetadata: payload.app_metadata || {},
        userMetadata: payload.user_metadata || {},
      };

      return {
        authenticated: true,
        user,
        role: userRole,
      };
    },
  };
}
