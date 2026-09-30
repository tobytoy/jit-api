import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

export interface UpstreamFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  secretRef?: string;
  authHeader?: string; // default: 'Authorization'
  authPrefix?: string; // default: 'Bearer '
  cacheTtlSeconds?: number;
  timeoutMs?: number;
  queryParams?: Record<string, string | number>;
  variables?: Record<string, any>;
  retry?: {
    maxRetries: number;
    backoffMs?: number;
  };
  circuitBreaker?: {
    failureThreshold: number;
    openDurationMs: number;
  };
  fallbackMock?: any;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  openUntil: number;
}

export class CircuitBreakerOpenError extends Error {
  public statusCode = 503;
  constructor(endpoint: string, openUntil: number) {
    const remainingSeconds = Math.max(0, Math.ceil((openUntil - Date.now()) / 1000));
    super(`[CircuitBreaker:OPEN] Upstream endpoint '${endpoint}' is open. Retry in ${remainingSeconds}s.`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export interface CachedResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
}

export interface UpstreamSecretInfo {
  ref: string;
  masked: string;
  maskedValue: string;
  source: 'env' | 'local_file' | 'env_or_hf_secrets';
}

export class UpstreamClient {
  private secretsDir: string;
  private secretsFile: string;
  private localSecrets: Map<string, string> = new Map();
  private cache: Map<string, CachedResponse> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(storageDirOrFile?: string) {
    if (storageDirOrFile && storageDirOrFile.endsWith('.json')) {
      this.secretsFile = storageDirOrFile;
      this.secretsDir = path.dirname(storageDirOrFile);
    } else {
      this.secretsDir = storageDirOrFile || path.resolve(process.cwd(), '.jit');
      this.secretsFile = path.join(this.secretsDir, 'upstream_secrets.json');
    }
    this.loadLocalSecrets();
  }

  private loadLocalSecrets(): void {
    try {
      if (fs.existsSync(this.secretsFile)) {
        const raw = fs.readFileSync(this.secretsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') {
            this.localSecrets.set(k, v);
          }
        }
      }
    } catch {
      // Fallback silently to memory
    }
  }

  private saveLocalSecrets(): void {
    try {
      if (!fs.existsSync(this.secretsDir)) {
        fs.mkdirSync(this.secretsDir, { recursive: true });
      }
      const obj: Record<string, string> = {};
      for (const [k, v] of this.localSecrets.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.secretsFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch {
      // Ignored in read-only / test environment
    }
  }

  /**
   * Safe Secret Lookup Hierarchy:
   * 1. process.env[`UPSTREAM_${ref.toUpperCase()}`] (HF Space Secrets standard)
   * 2. process.env[ref]
   * 3. .jit/upstream_secrets.json (Local development)
   */
  public getSecret(ref: string): string | undefined {
    if (!ref) return undefined;
    const cleanRef = ref.trim();

    // 1. Check UPSTREAM_<REF> in env
    const envPrefixed = process.env[`UPSTREAM_${cleanRef.toUpperCase()}`];
    if (envPrefixed && envPrefixed.trim().length > 0) {
      return envPrefixed.trim();
    }

    // 2. Check direct env
    const envDirect = process.env[cleanRef];
    if (envDirect && envDirect.trim().length > 0) {
      return envDirect.trim();
    }

    // 3. Check local file secrets
    return this.localSecrets.get(cleanRef);
  }

  public setSecret(ref: string, value: string): void {
    this.localSecrets.set(ref.trim(), value.trim());
    this.saveLocalSecrets();
  }

  public saveSecret(ref: string, value: string): void {
    this.setSecret(ref, value);
  }

  public resolveSecret(ref: string): string | undefined {
    return this.getSecret(ref);
  }

  public deleteSecret(ref: string): boolean {
    const deleted = this.localSecrets.delete(ref.trim());
    if (deleted) this.saveLocalSecrets();
    return deleted;
  }

  public listSecrets(): UpstreamSecretInfo[] {
    const map = new Map<string, UpstreamSecretInfo>();

    // Scan process.env for UPSTREAM_*
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith('UPSTREAM_') && v) {
        const refName = k.substring('UPSTREAM_'.length).toLowerCase();
        const masked = this.maskSecret(v);
        map.set(refName, {
          ref: refName,
          masked,
          maskedValue: masked,
          source: 'env_or_hf_secrets',
        });
      }
    }

    // Scan local secrets
    for (const [k, v] of this.localSecrets.entries()) {
      if (!map.has(k)) {
        const masked = this.maskSecret(v);
        map.set(k, {
          ref: k,
          masked,
          maskedValue: masked,
          source: 'local_file',
        });
      }
    }

    return Array.from(map.values());
  }

  public maskSecret(val: string): string {
    if (!val || val.length <= 4) return '****';
    const head = val.slice(0, 3);
    const tail = val.slice(-3);
    return `${head}****${tail}`;
  }

  public assertSafeUrl(rawUrl: string): void {
    const res = UpstreamClient.isSafeUrl(rawUrl);
    if (!res.safe) {
      throw new Error(`SSRF protection: ${res.reason}`);
    }
  }

  /**
   * SSRF Protection Validator (Static & Instance helper)
   */
  public isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
    return UpstreamClient.isSafeUrl(rawUrl);
  }

  public static isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
    try {
      const parsed = new url.URL(rawUrl);

      // Only allow http and https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `不允許的協定: ${parsed.protocol}，僅支援 http/https` };
      }

      const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

      // Check loopback / localhost / internal domains
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.lan') ||
        hostname === '::1' ||
        hostname === '0.0.0.0'
      ) {
        return { safe: false, reason: `禁止存取本地主機或內部網域: ${hostname}` };
      }

      // Check IPv6 Link-Local and Unique Local (fc00::/7, fe80::/10)
      if (hostname.startsWith('fe80:') || hostname.startsWith('fc00:') || hostname.startsWith('fd00:')) {
        return { safe: false, reason: `禁止存取 IPv6 內部私有或 Link-Local IP: ${hostname}` };
      }

      // Check IPv4 private and reserved ranges
      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const [_, o1, o2] = ipv4Match.map(Number);
        if (o1 === 127) return { safe: false, reason: '禁止存取本機 Loopback 網段 (127.0.0.0/8)' };
        if (o1 === 0) return { safe: false, reason: '禁止存取保留網段 (0.0.0.0/8)' };
        if (o1 === 10) return { safe: false, reason: '禁止存取內部私有 IP (10.0.0.0/8)' };
        if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: '禁止存取內部私有 IP (172.16.0.0/12)' };
        if (o1 === 192 && o2 === 168) return { safe: false, reason: '禁止存取內部私有 IP (192.168.0.0/16)' };
        if (o1 === 169 && o2 === 254) return { safe: false, reason: '禁止存取雲端 Metadata IP (169.254.0.0/16)' };
        if (o1 === 100 && o2 >= 64 && o2 <= 127) return { safe: false, reason: '禁止存取電信級 CGNAT 私有 IP (100.64.0.0/10)' };
      }

      return { safe: true };
    } catch (err: any) {
      return { safe: false, reason: `無效的 URL 格式: ${err.message}` };
    }
  }

  /**
   * Interpolate template variables {{key}} and {{env.KEY}} in target URL or headers
   */
  public interpolate(template: string, variables?: Record<string, any>): string {
    if (!template) return template;
    return template.replace(/\{\{\s*([\w\.\-]+)\s*\}\}/g, (_, key) => {
      if (key.startsWith('env.')) {
        const envKey = key.slice(4);
        return (typeof process !== 'undefined' && process.env?.[envKey]) || '';
      }
      if (variables && variables[key] !== undefined) {
        return String(variables[key]);
      }
      return '';
    });
  }

  public getCircuitBreakerState(endpoint: string): CircuitBreakerState {
    const existing = this.circuitBreakers.get(endpoint);
    if (!existing) {
      const initial: CircuitBreakerState = { state: 'CLOSED', failures: 0, lastFailureTime: 0, openUntil: 0 };
      this.circuitBreakers.set(endpoint, initial);
      return initial;
    }
    if (existing.state === 'OPEN' && Date.now() >= existing.openUntil) {
      existing.state = 'HALF_OPEN';
    }
    return existing;
  }

  public recordSuccess(endpoint: string): void {
    const cb = this.circuitBreakers.get(endpoint);
    if (cb) {
      cb.state = 'CLOSED';
      cb.failures = 0;
    }
  }

  public recordFailure(endpoint: string, threshold = 3, openDurationMs = 60000): void {
    const cb = this.getCircuitBreakerState(endpoint);
    cb.failures += 1;
    cb.lastFailureTime = Date.now();
    if (cb.failures >= threshold) {
      cb.state = 'OPEN';
      cb.openUntil = Date.now() + openDurationMs;
    }
  }

  public resetCircuitBreaker(endpoint?: string): void {
    if (endpoint) {
      this.circuitBreakers.delete(endpoint);
    } else {
      this.circuitBreakers.clear();
    }
  }

  /**
   * Execute safe outbound HTTP fetch with SSRF check, secret injection, Circuit Breaker, Retries, and TTL caching
   */
  public async fetch<T = any>(targetUrl: string, options: UpstreamFetchOptions = {}): Promise<{
    data: T;
    fromCache: boolean;
    cachedAgeSeconds?: number;
    status: number;
    fromFallbackMock?: boolean;
  }> {
    // 0. Interpolate URL if variables provided
    const resolvedUrl = options.variables ? this.interpolate(targetUrl, options.variables) : targetUrl;

    // 1. SSRF check
    const safety = this.isSafeUrl(resolvedUrl);
    if (!safety.safe) {
      throw new Error(`[SSRF 防護阻擋] ${safety.reason}`);
    }

    // 2. Construct final URL with query params
    const parsedUrl = new url.URL(resolvedUrl);
    if (options.queryParams) {
      for (const [k, v] of Object.entries(options.queryParams)) {
        parsedUrl.searchParams.set(k, String(v));
      }
    }
    const finalUrl = parsedUrl.toString();
    const method = (options.method || 'GET').toUpperCase();
    const endpointKey = parsedUrl.origin;

    // 3. Circuit Breaker check
    if (options.circuitBreaker) {
      const cbState = this.getCircuitBreakerState(endpointKey);
      if (cbState.state === 'OPEN') {
        if (options.fallbackMock !== undefined) {
          return {
            data: options.fallbackMock as T,
            fromCache: false,
            status: 200,
            fromFallbackMock: true,
          };
        }
        throw new CircuitBreakerOpenError(endpointKey, cbState.openUntil);
      }
    }

    // 4. Check in-memory cache
    const cacheKey = `${method}:${finalUrl}:${JSON.stringify(options.body || {})}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      const ageSec = Math.floor((now - cached.cachedAt) / 1000);
      return {
        data: cached.data as T,
        fromCache: true,
        cachedAgeSeconds: ageSec,
        status: cached.status,
      };
    }

    // 5. Resolve Upstream Secret
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'JIT-Protocol-Synthesis/2.0 Upstream-Proxy',
      ...(options.headers || {}),
    };

    if (options.secretRef) {
      const secret = this.getSecret(options.secretRef);
      if (secret) {
        const headerName = options.authHeader || 'Authorization';
        const prefix = options.authPrefix !== undefined ? options.authPrefix : 'Bearer ';
        headers[headerName] = `${prefix}${secret}`.trim();
      }
    }

    // 6. Outbound fetch with Retries & Circuit Breaker
    const timeoutMs = options.timeoutMs || 10000;
    const maxRetries = options.retry?.maxRetries ?? 0;
    const backoffMs = options.retry?.backoffMs ?? 300;

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const fetchOpts: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (options.body && method !== 'GET' && method !== 'HEAD') {
          if (typeof options.body === 'object') {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            fetchOpts.body = JSON.stringify(options.body);
          } else {
            fetchOpts.body = String(options.body);
          }
        }

        const res = await fetch(finalUrl, fetchOpts);
        clearTimeout(timer);

        let data: any;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          data = await res.text();
        }

        if (!res.ok) {
          throw new Error(`Upstream API 回傳錯誤 HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
        }

        // Success - record with Circuit Breaker
        if (options.circuitBreaker) {
          this.recordSuccess(endpointKey);
        }

        // Cache response if TTL > 0
        const ttlSec = options.cacheTtlSeconds !== undefined ? options.cacheTtlSeconds : 60;
        if (ttlSec > 0 && method === 'GET') {
          this.cache.set(cacheKey, {
            data,
            status: res.status,
            headers: {},
            cachedAt: now,
            expiresAt: now + ttlSec * 1000,
          });
        }

        return {
          data: data as T,
          fromCache: false,
          status: res.status,
        };
      } catch (err: any) {
        clearTimeout(timer);
        const isTimeout = err.name === 'AbortError';
        const formattedErr = isTimeout
          ? new Error(`Upstream 請求逾時 (${timeoutMs}ms): ${resolvedUrl}`)
          : err;

        attempt++;
        if (attempt <= maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Record failure in Circuit Breaker
        if (options.circuitBreaker) {
          this.recordFailure(
            endpointKey,
            options.circuitBreaker.failureThreshold,
            options.circuitBreaker.openDurationMs
          );
        }

        // Graceful Fallback Mock if configured
        if (options.fallbackMock !== undefined) {
          return {
            data: options.fallbackMock as T,
            fromCache: false,
            status: 200,
            fromFallbackMock: true,
          };
        }

        throw formattedErr;
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheCount(): number {
    return this.cache.size;
  }
}
