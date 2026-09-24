/**
 * JIT Protocol Synthesis - Traffic Light Protocol & Anti-Yo-Yo Coordinator
 *
 * Coordinates Client and Server editing roles and prevents oscillating race conditions
 * (the "Yo-Yo Effect") during API evolution and runtime optimization.
 */

export type TrafficLightColor = 'GREEN' | 'YELLOW' | 'RED';

export interface RouteLockInfo {
  route: string;
  lockedBy: 'client' | 'server' | 'system';
  reason: string;
  lockedAt: number;
  ttlMs: number;
  expiresAt: number;
}

export interface RouteTrafficLight {
  route: string;
  color: TrafficLightColor;
  label: string;
  description: string;
  lock?: RouteLockInfo;
  canClientEdit: boolean;
  canServerEdit: boolean;
  phase?: string;
  updatedAt: string;
}

export interface LockAcquireOptions {
  route: string;
  role: 'client' | 'server' | 'system';
  reason: string;
  ttlMs?: number;
}

export class TrafficLightManager {
  private locks: Map<string, RouteLockInfo> = new Map();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 45000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Acquire an editing or operational lock on a specific route
   */
  public acquireLock(options: LockAcquireOptions): { success: boolean; error?: string; lock?: RouteLockInfo } {
    const { route, role, reason } = options;
    const ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : this.defaultTtlMs;
    const now = Date.now();

    // Check active lock
    const currentLock = this.locks.get(route);
    if (currentLock) {
      if (now < currentLock.expiresAt) {
        // Already locked by someone else
        if (currentLock.lockedBy !== role) {
          return {
            success: false,
            error: `路由 '${route}' 目前由 ${currentLock.lockedBy.toUpperCase()} 鎖定中 (原因: ${currentLock.reason})，請等待釋放。`,
            lock: currentLock,
          };
        }
        // Same role renewing lock
        currentLock.reason = reason;
        currentLock.ttlMs = ttlMs;
        currentLock.expiresAt = now + ttlMs;
        return { success: true, lock: currentLock };
      } else {
        // Expired lock
        this.locks.delete(route);
      }
    }

    const newLock: RouteLockInfo = {
      route,
      lockedBy: role,
      reason,
      lockedAt: now,
      ttlMs,
      expiresAt: now + ttlMs,
    };

    this.locks.set(route, newLock);
    return { success: true, lock: newLock };
  }

  /**
   * Release an active lock on a route
   */
  public releaseLock(route: string, role?: 'client' | 'server' | 'system' | 'force'): boolean {
    const lock = this.locks.get(route);
    if (!lock) return false;

    if (!role || role === 'force' || lock.lockedBy === role) {
      this.locks.delete(route);
      return true;
    }

    return false;
  }

  /**
   * Get active lock for a route (handling automatic TTL expiration)
   */
  public getLock(route: string): RouteLockInfo | undefined {
    const lock = this.locks.get(route);
    if (!lock) return undefined;

    if (Date.now() >= lock.expiresAt) {
      this.locks.delete(route);
      return undefined;
    }

    return lock;
  }

  /**
   * Evaluate the real-time Traffic Light state for a route
   *
   * @param route Target route identifier
   * @param isFrozen Whether route has crystallized into Phase 3
   * @param metrics Observation metrics (sample count, consecutive matches, etc.)
   * @param hasRecentDrift Whether a soft or hard drift was recently detected
   */
  public evaluateLight(
    route: string,
    isFrozen: boolean,
    metrics?: { consecutiveMatches?: number; requiredThreshold?: number; isStable?: boolean },
    hasRecentDrift: boolean = false
  ): RouteTrafficLight {
    const activeLock = this.getLock(route);

    // 1. RED State: Active Lock held by either party
    if (activeLock) {
      const isServerLock = activeLock.lockedBy === 'server';
      const isClientLock = activeLock.lockedBy === 'client';

      return {
        route,
        color: 'RED',
        label: `紅燈 (LOCKED - ${activeLock.lockedBy.toUpperCase()})`,
        description: `鎖定進行中: ${activeLock.reason} (剩餘 ${Math.max(0, Math.ceil((activeLock.expiresAt - Date.now()) / 1000))} 秒)`,
        lock: activeLock,
        canClientEdit: isClientLock,
        canServerEdit: isServerLock,
        phase: isFrozen ? 'phase3_frozen' : 'phase1_dynamic',
        updatedAt: new Date().toISOString(),
      };
    }

    // 2. YELLOW State: Negotiating / Evolving / Drift detected
    const matches = metrics?.consecutiveMatches ?? 0;
    const threshold = metrics?.requiredThreshold ?? 3;
    const isEvolving = !isFrozen && matches > 0 && matches < threshold;

    if (hasRecentDrift || isEvolving) {
      return {
        route,
        color: 'YELLOW',
        label: '黃燈 (NEGOTIATING / 協商演進中)',
        description: hasRecentDrift
          ? '檢測到欄位漂移或自適應中，請暫停重構以待收斂。'
          : `樣本協商中 (${matches}/${threshold} 次)，雙端正在對齊 Schema。`,
        canClientEdit: true,
        canServerEdit: true,
        phase: 'phase2_observing',
        updatedAt: new Date().toISOString(),
      };
    }

    // 3. GREEN State: Synced / Ready
    if (isFrozen) {
      return {
        route,
        color: 'GREEN',
        label: '綠燈 (SYNCED / 靜態極速)',
        description: '雙端合約已完全固化 (Phase 3 Fast-Path)，延遲 <1ms，運行極致穩定。',
        canClientEdit: true,
        canServerEdit: true,
        phase: 'phase3_frozen',
        updatedAt: new Date().toISOString(),
      };
    }

    // Open / Initial Phase 1
    return {
      route,
      color: 'GREEN',
      label: '綠燈 (READY / 開放對接)',
      description: '規格處於開放階段，雙端均可自由調試與發起新欄位需求。',
      canClientEdit: true,
      canServerEdit: true,
      phase: 'phase1_dynamic',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get all active locks
   */
  public listLocks(): RouteLockInfo[] {
    const now = Date.now();
    const active: RouteLockInfo[] = [];
    for (const [route, lock] of this.locks.entries()) {
      if (now < lock.expiresAt) {
        active.push(lock);
      } else {
        this.locks.delete(route);
      }
    }
    return active;
  }
}
