import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { MasterAuthSession, MasterAuthStatus } from './types.js';

export interface MasterAuthConfig {
  password?: string;
  sessionTtlMs?: number; // default: 24h
  maxFailedAttempts?: number; // default: 5
  lockoutDurationMs?: number; // default: 15 min
}

interface FailedAttemptRecord {
  count: number;
  lastAttemptAt: number;
  lockedUntil?: number;
}

export class MasterAuthManager {
  private password: string;
  private sessionTtlMs: number;
  private maxFailedAttempts: number;
  private lockoutDurationMs: number;
  private sessions: Map<string, MasterAuthSession> = new Map();
  private failedAttempts: Map<string, FailedAttemptRecord> = new Map();

  constructor(config?: MasterAuthConfig | string) {
    if (typeof config === 'string') {
      this.password = config.trim();
      this.sessionTtlMs = 24 * 60 * 60 * 1000;
      this.maxFailedAttempts = 5;
      this.lockoutDurationMs = 15 * 60 * 1000;
    } else {
      this.password = (config?.password !== undefined ? config.password : (process.env.MASTER_PASSWORD || '')).trim();
      this.sessionTtlMs = config?.sessionTtlMs || 24 * 60 * 60 * 1000; // 24 hours
      this.maxFailedAttempts = config?.maxFailedAttempts || 5;
      this.lockoutDurationMs = config?.lockoutDurationMs || 15 * 60 * 1000; // 15 mins
    }
  }

  public isAuthEnabled(): boolean {
    return this.password.length > 0;
  }

  public isLoginRequired(): boolean {
    return this.isAuthEnabled();
  }

  public isSpaceEnvironment(): boolean {
    return Boolean(process.env.SPACE_ID || process.env.SPACE_HOST);
  }

  /**
   * Attempt master password login with brute-force lockout protection.
   */
  public login(password: string, clientIp: string = '127.0.0.1'): {
    success: boolean;
    token?: string;
    expiresAt?: number;
    error?: string;
    remainingAttempts?: number;
    lockedRemainingSeconds?: number;
    lockoutRemainingMinutes?: number;
  } {
    // If auth is not enabled, any login creates a valid session
    if (!this.isAuthEnabled()) {
      const token = this.generateToken();
      const expiresAt = Date.now() + this.sessionTtlMs;
      this.sessions.set(token, { token, createdAt: Date.now(), expiresAt, ip: clientIp });
      return { success: true, token, expiresAt };
    }

    // Check brute force lockout
    const attemptRecord = this.failedAttempts.get(clientIp);
    const now = Date.now();
    if (attemptRecord && attemptRecord.lockedUntil && attemptRecord.lockedUntil > now) {
      const remainingSeconds = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      return {
        success: false,
        error: `登入失敗次數過多，此 IP 已被暫時鎖定。請於 ${remainingSeconds} 秒後重試。`,
        lockedRemainingSeconds: remainingSeconds,
        lockoutRemainingMinutes: Math.ceil(remainingSeconds / 60),
      };
    }

    // Constant-time password comparison to prevent timing attacks
    const isMatch = this.safeCompare(password, this.password);

    if (!isMatch) {
      const record = attemptRecord || { count: 0, lastAttemptAt: now };
      record.count += 1;
      record.lastAttemptAt = now;

      if (record.count >= this.maxFailedAttempts) {
        record.lockedUntil = now + this.lockoutDurationMs;
        this.failedAttempts.set(clientIp, record);
        const lockedSec = Math.ceil(this.lockoutDurationMs / 1000);
        return {
          success: false,
          error: `密碼錯誤次數達 ${this.maxFailedAttempts} 次，為防止暴力破解，系統已鎖定登入 15 分鐘。`,
          lockedRemainingSeconds: lockedSec,
          lockoutRemainingMinutes: Math.ceil(lockedSec / 60),
          remainingAttempts: 0,
        };
      }

      this.failedAttempts.set(clientIp, record);
      const remaining = this.maxFailedAttempts - record.count;
      return {
        success: false,
        remainingAttempts: remaining,
        error: `Master 密碼錯誤，剩餘嘗試次數：${remaining}`,
      };
    }

    // Success -> Clear failed attempts & create session
    this.failedAttempts.delete(clientIp);
    const token = this.generateToken();
    const expiresAt = now + this.sessionTtlMs;
    this.sessions.set(token, { token, createdAt: now, expiresAt, ip: clientIp, role: 'master' });

    return { success: true, token, expiresAt };
  }

  public logout(token: string): boolean {
    return this.sessions.delete(token);
  }

  public getSession(token?: string): MasterAuthSession | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  public verifyToken(token?: string): MasterAuthSession | null {
    return this.getSession(token);
  }

  public validateToken(token?: string): boolean {
    if (!this.isAuthEnabled()) return true;
    return this.getSession(token) !== null;
  }

  public extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    const customHeader = req.headers['x-master-token'];
    if (typeof customHeader === 'string' && customHeader.trim()) {
      return customHeader.trim();
    }
    if (req.query?.master_token && typeof req.query.master_token === 'string') {
      return req.query.master_token.trim();
    }
    return undefined;
  }

  public isRequestAuthenticated(req: Request): boolean {
    if (!this.isAuthEnabled()) return true;
    const token = this.extractToken(req);
    return this.validateToken(token);
  }

  public getStatus(req: Request): MasterAuthStatus {
    const enabled = this.isAuthEnabled();
    const authenticated = this.isRequestAuthenticated(req);
    const spaceEnv = this.isSpaceEnvironment();

    return {
      enabled,
      authenticated,
      role: authenticated ? 'master' : 'guest',
      spaceEnvironment: spaceEnv,
      requiresLogin: enabled && !authenticated,
    };
  }

  /**
   * Express Middleware to enforce Master Authentication for protected routes
   */
  public requireMaster = (req: Request, res: Response, next: NextFunction): void => {
    if (this.isRequestAuthenticated(req)) {
      return next();
    }

    res.status(401).json({
      error: 'Unauthorized: Master authentication required',
      message: '此管理操作僅限 Master 工程師執行，請在 Studio 右上方輸入 Master 密碼解鎖。',
      requiresLogin: true,
    });
  };

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
