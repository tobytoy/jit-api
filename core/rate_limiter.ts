import { RateLimitDefinition } from './types.js';

interface RequestBucket {
  timestamps: number[];
  dayCount: number;
  dayResetAt: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  error?: string;
}

export class RateLimiter {
  private buckets: Map<string, RequestBucket> = new Map();

  /**
   * Check rate limit for a specific identifier (API key, IP, or tenant ID)
   */
  public checkLimit(identifier: string, rule: RateLimitDefinition): RateLimitCheckResult {
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;

    let bucket = this.buckets.get(identifier);
    if (!bucket) {
      bucket = {
        timestamps: [],
        dayCount: 0,
        dayResetAt: now + 24 * 60 * 60 * 1000,
      };
      this.buckets.set(identifier, bucket);
    }

    // Reset daily quota if 24 hours elapsed
    if (now > bucket.dayResetAt) {
      bucket.dayCount = 0;
      bucket.dayResetAt = now + 24 * 60 * 60 * 1000;
    }

    // Check daily quota
    if (rule.dailyQuota && bucket.dayCount >= rule.dailyQuota) {
      const resetHours = Math.ceil((bucket.dayResetAt - now) / (60 * 60 * 1000));
      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetSeconds: Math.ceil((bucket.dayResetAt - now) / 1000),
        error: `已超出每日請求額度 (${rule.dailyQuota} 次/日)，將於 ${resetHours} 小時後重置。`,
      };
    }

    // Filter timestamps inside sliding window
    const windowStart = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

    // Check sliding window request count
    if (bucket.timestamps.length >= rule.maxRequests) {
      const oldestInWindow = bucket.timestamps[0];
      const resetMs = oldestInWindow + windowMs - now;
      const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetSeconds,
        error: `請求頻率過高 (上限: ${rule.maxRequests} 次 / ${rule.windowSeconds} 秒)，請稍候 ${resetSeconds} 秒後重試 (HTTP 429)。`,
      };
    }

    // Allowed -> Record this request
    bucket.timestamps.push(now);
    bucket.dayCount += 1;

    const remaining = Math.max(0, rule.maxRequests - bucket.timestamps.length);
    return {
      allowed: true,
      limit: rule.maxRequests,
      remaining,
      resetSeconds: rule.windowSeconds,
    };
  }

  public reset(identifier?: string): void {
    if (identifier) {
      this.buckets.delete(identifier);
    } else {
      this.buckets.clear();
    }
  }

  public checkRateLimit(
    identifier: string,
    limit: { requestsPerMinute?: number; dailyQuota?: number; maxRequests?: number; windowSeconds?: number }
  ): RateLimitCheckResult & { retryAfterSeconds?: number } {
    const rule: RateLimitDefinition = {
      maxRequests: limit.maxRequests || limit.requestsPerMinute || 60,
      windowSeconds: limit.windowSeconds || 60,
      dailyQuota: limit.dailyQuota,
    };
    const res = this.checkLimit(identifier, rule);
    return {
      ...res,
      retryAfterSeconds: res.resetSeconds,
    };
  }
}
