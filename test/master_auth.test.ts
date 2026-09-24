import { describe, it, expect, beforeEach } from 'vitest';
import { MasterAuthManager } from '../core/master_auth.js';

describe('MasterAuthManager: Authentication & Brute-Force Protection', () => {
    let auth: MasterAuthManager;

    beforeEach(() => {
        auth = new MasterAuthManager('secret123');
    });

    it('should correctly report if login is required', () => {
        expect(auth.isLoginRequired()).toBe(true);

        const openAuth = new MasterAuthManager('');
        expect(openAuth.isLoginRequired()).toBe(false);
    });

    it('should allow login with correct password and issue session token', () => {
        const res = auth.login('secret123', '192.168.1.10');
        expect(res.success).toBe(true);
        expect(res.token).toBeDefined();
        expect(res.token?.length).toBeGreaterThan(16);

        const session = auth.verifyToken(res.token);
        expect(session).not.toBeNull();
        expect(session?.role).toBe('master');
    });

    it('should reject incorrect password with remaining attempt count', () => {
        const res = auth.login('wrong-pass', '192.168.1.11');
        expect(res.success).toBe(false);
        expect(res.error).toContain('密碼錯誤');
        expect(res.remainingAttempts).toBe(4);
    });

    it('should lock out IP after 5 consecutive failed attempts', () => {
        const ip = '10.99.88.77';
        for (let i = 0; i < 4; i++) {
            const res = auth.login('bad-pass', ip);
            expect(res.success).toBe(false);
            expect(res.remainingAttempts).toBe(4 - i);
        }

        // 5th attempt locks the IP
        const fifth = auth.login('bad-pass', ip);
        expect(fifth.success).toBe(false);
        expect(fifth.lockoutRemainingMinutes).toBeDefined();
        expect(fifth.error).toContain('鎖定');

        // 6th attempt is blocked even with correct password
        const sixth = auth.login('secret123', ip);
        expect(sixth.success).toBe(false);
        expect(sixth.error).toContain('鎖定');
    });

    it('should revoke token on logout', () => {
        const res = auth.login('secret123', '127.0.0.1');
        const token = res.token!;
        expect(auth.verifyToken(token)).not.toBeNull();

        auth.logout(token);
        expect(auth.verifyToken(token)).toBeNull();
    });

    it('should enforce requireMaster middleware for Express', () => {
        const res = auth.login('secret123', '127.0.0.1');
        const token = res.token!;

        // 1. Valid token in header
        let nextCalled = false;
        const validReq: any = {
            headers: { authorization: `Bearer ${token}` },
            ip: '127.0.0.1',
        };
        const resObj: any = {
            status: (code: number) => ({ json: (d: any) => ({ code, d }) }),
        };

        auth.requireMaster(validReq, resObj, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);

        // 2. Missing token
        let blockedCode = 0;
        let blockedBody: any = null;
        const invalidReq: any = {
            headers: {},
            ip: '127.0.0.1',
        };
        const blockedRes: any = {
            status: (code: number) => {
                blockedCode = code;
                return {
                    json: (data: any) => {
                        blockedBody = data;
                    },
                };
            },
        };

        auth.requireMaster(invalidReq, blockedRes, () => {});
        expect(blockedCode).toBe(401);
        expect(blockedBody.requiresLogin).toBe(true);
    });
});
