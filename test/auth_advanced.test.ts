import { describe, it, expect } from 'vitest';
import {
  createAdvancedAuthPlugin,
  generateSignedJwt,
  MemoryBlacklistStore,
} from '../plugins/auth_rbac_jwt.js';

describe('Advanced Auth, RBAC & Token Blacklist Plugin', () => {
  const secret = 'super-secret-key-for-test-32chars!';

  it('should authenticate valid HS256 signed JWT with correct payload', async () => {
    const plugin = createAdvancedAuthPlugin({ jwtSecret: secret, requireSignature: true });

    const token = generateSignedJwt(
      { sub: 'usr_123', email: 'alice@example.com', role: 'admin' },
      secret,
      { expiresInSec: 3600 }
    );

    const result = await plugin.authValidator!(
      `Bearer ${token}`,
      { type: 'bearer', options: { role: 'admin' } }
    );

    expect(result).not.toBeNull();
    expect(result?.authenticated).toBe(true);
    expect(result?.user?.email).toBe('alice@example.com');
    expect(result?.role).toBe('admin');
  });

  it('should reject tampered or forged JWT signatures in constant time', async () => {
    const plugin = createAdvancedAuthPlugin({ jwtSecret: secret, requireSignature: true });

    // Generate token with different secret
    const forgedToken = generateSignedJwt(
      { sub: 'usr_hacker', role: 'admin' },
      'wrong-secret-key-1234567890123456'
    );

    const result = await plugin.authValidator!(
      `Bearer ${forgedToken}`,
      { type: 'bearer' }
    );

    expect(result?.authenticated).toBe(false);
    expect(result?.error).toContain('Invalid JWT signature');
  });

  it('should reject expired JWT tokens', async () => {
    const plugin = createAdvancedAuthPlugin({ jwtSecret: secret });

    // Token expired 10 seconds ago
    const expiredToken = generateSignedJwt(
      { sub: 'usr_123', exp: Math.floor(Date.now() / 1000) - 10 },
      secret
    );

    const result = await plugin.authValidator!(
      `Bearer ${expiredToken}`,
      { type: 'bearer' }
    );

    expect(result?.authenticated).toBe(false);
    expect(result?.error).toContain('Token expired');
  });

  it('should enforce JTI Token Blacklist and reject revoked tokens', async () => {
    const blacklist = new MemoryBlacklistStore();
    const plugin = createAdvancedAuthPlugin({
      jwtSecret: secret,
      blacklistStore: blacklist,
    });

    const activeToken = generateSignedJwt(
      { sub: 'usr_456', jti: 'token-uuid-001' },
      secret
    );

    // 1. Initial request should succeed
    const res1 = await plugin.authValidator!(`Bearer ${activeToken}`, { type: 'bearer' });
    expect(res1?.authenticated).toBe(true);

    // 2. Revoke the token by JTI
    await plugin.revokeToken('token-uuid-001');

    // 3. Subsequent request should be blocked
    const res2 = await plugin.authValidator!(`Bearer ${activeToken}`, { type: 'bearer' });
    expect(res2?.authenticated).toBe(false);
    expect(res2?.error).toContain("Token revoked: JTI 'token-uuid-001' is in blacklist");
  });

  it('should enforce Action-level fine-grained RBAC with wildcard permissions', async () => {
    const plugin = createAdvancedAuthPlugin({
      jwtSecret: secret,
      rolePermissions: {
        operator: ['orders:*', 'inventory:read'],
        viewer: ['*:read'],
      },
    });

    // Case 1: Operator with role 'operator' has 'orders:*', tries 'orders:create' -> PASS
    const operatorToken = generateSignedJwt(
      { sub: 'usr_op', role: 'operator' },
      secret
    );
    const opRes = await plugin.authValidator!(
      `Bearer ${operatorToken}`,
      { type: 'bearer', options: { action: 'orders:create' } as any }
    );
    expect(opRes?.authenticated).toBe(true);

    // Case 2: Operator tries 'billing:refund' -> FORBIDDEN
    const opBillingRes = await plugin.authValidator!(
      `Bearer ${operatorToken}`,
      { type: 'bearer', options: { action: 'billing:refund' } as any }
    );
    expect(opBillingRes?.authenticated).toBe(false);
    expect(opBillingRes?.error).toContain("Missing required action permission 'billing:refund'");

    // Case 3: Viewer with role 'viewer' tries 'orders:read' -> PASS (via *:read)
    const viewerToken = generateSignedJwt(
      { sub: 'usr_viewer', role: 'viewer' },
      secret
    );
    const viewerRes = await plugin.authValidator!(
      `Bearer ${viewerToken}`,
      { type: 'bearer', options: { action: 'orders:read' } as any }
    );
    expect(viewerRes?.authenticated).toBe(true);

    // Case 4: Viewer tries 'orders:delete' -> FORBIDDEN
    const viewerDelRes = await plugin.authValidator!(
      `Bearer ${viewerToken}`,
      { type: 'bearer', options: { action: 'orders:delete' } as any }
    );
    expect(viewerDelRes?.authenticated).toBe(false);
  });
});
