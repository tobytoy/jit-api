/**
 * JIT Protocol Synthesis Framework - Advanced Auth, RBAC & Token Blacklist Plugin
 * 
 * Provides:
 * 1. Cryptographic JWT signature verification (HS256 HMAC & RS256 RSA) with constant-time equality.
 * 2. Token Revocation / JTI Blacklist with TTL memory store & pluggable Redis storage.
 * 3. Fine-grained Action-level RBAC (Wildcard permissions: 'orders:*', 'billing:read', '*').
 * 4. Role-to-Permission Matrix resolution.
 */

import crypto from 'node:crypto';
import { JITPlugin, AuthValidationResult } from '../core/plugin.js';
import { AuthDefinition } from '../core/types.js';

export interface BlacklistStore {
  revoke(jti: string, expiresAtSec?: number): Promise<void> | void;
  isRevoked(jti: string): Promise<boolean> | boolean;
}

export class MemoryBlacklistStore implements BlacklistStore {
  private revokedTokens = new Map<string, number | undefined>(); // jti -> expiresAtSec

  revoke(jti: string, expiresAtSec?: number): void {
    this.revokedTokens.set(jti, expiresAtSec);
    this.cleanExpired();
  }

  isRevoked(jti: string): boolean {
    const expiresAt = this.revokedTokens.get(jti);
    if (expiresAt !== undefined && Date.now() / 1000 > expiresAt) {
      this.revokedTokens.delete(jti);
      return false;
    }
    return this.revokedTokens.has(jti);
  }

  private cleanExpired(): void {
    const nowSec = Date.now() / 1000;
    for (const [jti, expiresAt] of this.revokedTokens.entries()) {
      if (expiresAt !== undefined && nowSec > expiresAt) {
        this.revokedTokens.delete(jti);
      }
    }
  }

  clear(): void {
    this.revokedTokens.clear();
  }
}

export interface AdvancedAuthPluginOptions {
  jwtSecret?: string;              // HMAC secret for HS256
  publicKeyPem?: string;           // RSA Public Key PEM for RS256
  blacklistStore?: BlacklistStore; // Custom or Memory blacklist store
  rolePermissions?: Record<string, string[]>; // e.g. { admin: ['*'], operator: ['orders:*'] }
  requireSignature?: boolean;      // If false (default false for dev, true for prod), allows testing without secret
}

export class RBACPolicyEngine {
  private rolePermissions: Map<string, string[]> = new Map();

  constructor(rolePermissions: Record<string, string[]> = {}) {
    for (const [role, perms] of Object.entries(rolePermissions)) {
      this.rolePermissions.set(role, perms);
    }
  }

  /**
   * Check if a set of granted permissions satisfies the required action/permission
   * Supports wildcards: '*' matches everything, 'orders:*' matches 'orders:create'
   */
  public hasPermission(granted: string[], required: string): boolean {
    for (const perm of granted) {
      if (perm === '*') return true;
      if (perm === required) return true;

      // Handle namespace wildcards, e.g. 'orders:*' matches 'orders:read'
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -1); // e.g. 'orders:'
        if (required.startsWith(prefix)) {
          return true;
        }
      }

      // Handle action wildcards, e.g. '*:read' matches 'orders:read'
      if (perm.startsWith('*:')) {
        const suffix = perm.slice(1); // e.g. ':read'
        if (required.endsWith(suffix)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Resolve all effective permissions for a user given their roles and direct permissions
   */
  public resolvePermissions(roles: string[] = [], directPermissions: string[] = []): string[] {
    const effective = new Set<string>(directPermissions);
    for (const role of roles) {
      const perms = this.rolePermissions.get(role);
      if (perms) {
        for (const p of perms) {
          effective.add(p);
        }
      }
    }
    return Array.from(effective);
  }
}

/**
 * Utility: Decode base64url string to utf-8
 */
function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Utility: Encode Buffer or string to base64url
 */
function base64UrlEncode(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Generate a signed JWT token (HS256) for tests and development
 */
export function generateSignedJwt(
  payload: Record<string, any>,
  secret: string,
  options: { expiresInSec?: number } = {}
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = options.expiresInSec ? Math.floor(Date.now() / 1000) + options.expiresInSec : undefined;
  const fullPayload = exp ? { ...payload, exp } : { ...payload };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signatureInput);
  const signature = base64UrlEncode(hmac.digest());

  return `${signatureInput}.${signature}`;
}

/**
 * Factory for Advanced Auth, RBAC & Token Blacklist Plugin
 */
export function createAdvancedAuthPlugin(options: AdvancedAuthPluginOptions = {}): JITPlugin & {
  blacklist: BlacklistStore;
  rbac: RBACPolicyEngine;
  revokeToken: (jti: string, expiresAtSec?: number) => Promise<void> | void;
  isTokenRevoked: (jti: string) => Promise<boolean> | boolean;
} {
  const blacklist = options.blacklistStore || new MemoryBlacklistStore();
  const rbac = new RBACPolicyEngine(options.rolePermissions || {
    admin: ['*'],
    operator: ['orders:*', 'inventory:*'],
    viewer: ['*:read', 'orders:read'],
  });

  return {
    name: 'auth-rbac-jwt',
    version: '1.4.3',
    description: 'Cryptographic JWT verification (HS256/RS256), JTI token blacklist, and action-level RBAC',
    blacklist,
    rbac,
    revokeToken: (jti: string, exp?: number) => blacklist.revoke(jti, exp),
    isTokenRevoked: (jti: string) => blacklist.isRevoked(jti),

    authValidator: async (
      tokenOrKey: string,
      authDef: AuthDefinition,
      _req?: any
    ): Promise<AuthValidationResult | null> => {
      // Clean 'Bearer ' prefix
      const token = tokenOrKey.replace(/^Bearer\s+/i, '').trim();
      const parts = token.split('.');

      if (parts.length !== 3) {
        return { authenticated: false, error: 'Invalid JWT format: Token must have 3 segments' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // 1. Decode Header and Payload
      let header: Record<string, any>;
      let payload: Record<string, any>;
      try {
        header = JSON.parse(base64UrlDecode(headerB64));
        payload = JSON.parse(base64UrlDecode(payloadB64));
      } catch {
        return { authenticated: false, error: 'Malformed JWT Header or Payload JSON' };
      }

      // 2. Cryptographic Signature Verification
      const signatureInput = `${headerB64}.${payloadB64}`;
      const alg = header.alg || 'HS256';

      if (options.requireSignature || options.jwtSecret || options.publicKeyPem) {
        if (alg === 'HS256') {
          if (!options.jwtSecret) {
            return { authenticated: false, error: 'Server configuration error: jwtSecret not set for HS256 verification' };
          }
          const hmac = crypto.createHmac('sha256', options.jwtSecret);
          hmac.update(signatureInput);
          const expectedSig = base64UrlEncode(hmac.digest());

          // Constant-time comparison
          const sigBuf = Buffer.from(signatureB64);
          const expectedBuf = Buffer.from(expectedSig);
          if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return { authenticated: false, error: 'Invalid JWT signature: Verification failed' };
          }
        } else if (alg === 'RS256') {
          if (!options.publicKeyPem) {
            return { authenticated: false, error: 'Server configuration error: publicKeyPem not set for RS256 verification' };
          }
          const verifier = crypto.createVerify('RSA-SHA256');
          verifier.update(signatureInput);
          const rawSig = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
          const isValid = verifier.verify(options.publicKeyPem, rawSig);
          if (!isValid) {
            return { authenticated: false, error: 'Invalid RS256 JWT signature: Verification failed' };
          }
        }
      }

      // 3. Expiration Check
      if (payload.exp && typeof payload.exp === 'number') {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec >= payload.exp) {
          return { authenticated: false, error: 'Token expired' };
        }
      }

      // 4. JTI Blacklist Revocation Check
      if (payload.jti) {
        const isRevoked = await Promise.resolve(blacklist.isRevoked(payload.jti));
        if (isRevoked) {
          return { authenticated: false, error: `Token revoked: JTI '${payload.jti}' is in blacklist` };
        }
      }

      // 5. Extract Roles & Direct Permissions
      const userRoles: string[] = [];
      if (payload.role) userRoles.push(payload.role);
      if (Array.isArray(payload.roles)) userRoles.push(...payload.roles);
      if (payload.app_metadata?.role) userRoles.push(payload.app_metadata.role);
      if (Array.isArray(payload.app_metadata?.roles)) userRoles.push(...payload.app_metadata.roles);

      const directPerms: string[] = [];
      if (Array.isArray(payload.permissions)) directPerms.push(...payload.permissions);
      if (typeof payload.scope === 'string') directPerms.push(...payload.scope.split(/\s+/));
      if (Array.isArray(payload.actions)) directPerms.push(...payload.actions);

      // Resolve effective permissions via RBAC engine
      const effectivePerms = rbac.resolvePermissions(userRoles, directPerms);

      // 6. Role Check (Legacy coarse check)
      const requiredRole = authDef.options?.role;
      if (requiredRole && !userRoles.includes(requiredRole)) {
        return {
          authenticated: false,
          role: userRoles[0] || 'anonymous',
          error: `Forbidden: Required role '${requiredRole}', but user has [${userRoles.join(', ')}]`,
        };
      }

      // 7. Action-Level Fine-Grained RBAC Check
      const requiredAction = (authDef.options as any)?.action || (authDef.options as any)?.requiredAction;
      if (requiredAction) {
        const allowed = rbac.hasPermission(effectivePerms, requiredAction);
        if (!allowed) {
          return {
            authenticated: false,
            role: userRoles[0],
            error: `Forbidden: Missing required action permission '${requiredAction}'`,
          };
        }
      }

      const requiredPermissions = (authDef.options as any)?.requiredPermissions as string[] | undefined;
      if (requiredPermissions && Array.isArray(requiredPermissions)) {
        for (const reqPerm of requiredPermissions) {
          if (!rbac.hasPermission(effectivePerms, reqPerm)) {
            return {
              authenticated: false,
              role: userRoles[0],
              error: `Forbidden: Missing required permission '${reqPerm}'`,
            };
          }
        }
      }

      return {
        authenticated: true,
        role: userRoles[0] || 'authenticated',
        user: {
          sub: payload.sub || payload.id,
          email: payload.email,
          roles: userRoles,
          permissions: effectivePerms,
          ...payload,
        },
      };
    },
  };
}
