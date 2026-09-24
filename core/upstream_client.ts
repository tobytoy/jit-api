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
    const res = this.isSafeUrl(rawUrl);
    if (!res.safe) {
      throw new Error(`SSRF protection: ${res.reason}`);
    }
  }

  /**
   * SSRF Protection Validator
   */
  public isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
    try {
      const parsed = new url.URL(rawUrl);

      // Only allow http and https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `不允許的協定: ${parsed.protocol}，僅支援 http/https` };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Check loopback / localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
        return { safe: false, reason: `禁止存取本地主機 (Loopback): ${hostname}` };
      }

      // Check IPv4 private ranges
      // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const [_, o1, o2] = ipv4Match.map(Number);
        if (o1 === 10) return { safe: false, reason: '禁止存取內部私有 IP (10.0.0.0/8)' };
        if (o1 === 172 && o2 >= 16 && o2 <= 31) return { safe: false, reason: '禁止存取內部私有 IP (172.16.0.0/12)' };
        if (o1 === 192 && o2 === 168) return { safe: false, reason: '禁止存取內部私有 IP (192.168.0.0/16)' };
        if (o1 === 169 && o2 === 254) return { safe: false, reason: '禁止存取雲端 Metadata IP (169.254.0.0/16)' };
      }

      return { safe: true };
    } catch (err: any) {
      return { safe: false, reason: `無效的 URL 格式: ${err.message}` };
    }
  }

  /**
   * Execute safe outbound HTTP fetch with SSRF check, secret injection, and in-memory TTL caching
   */
  public async fetch<T = any>(targetUrl: string, options: UpstreamFetchOptions = {}): Promise<{
    data: T;
    fromCache: boolean;
    cachedAgeSeconds?: number;
    status: number;
  }> {
    // 1. SSRF check
    const safety = this.isSafeUrl(targetUrl);
    if (!safety.safe) {
      throw new Error(`[SSRF 防護阻擋] ${safety.reason}`);
    }

    // 2. Construct final URL with query params
    const parsedUrl = new url.URL(targetUrl);
    if (options.queryParams) {
      for (const [k, v] of Object.entries(options.queryParams)) {
        parsedUrl.searchParams.set(k, String(v));
      }
    }
    const finalUrl = parsedUrl.toString();
    const method = (options.method || 'GET').toUpperCase();

    // 3. Check in-memory cache
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

    // 4. Resolve Upstream Secret
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

    // 5. Outbound fetch with timeout
    const timeoutMs = options.timeoutMs || 10000;
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

      // 6. Cache response if TTL > 0
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
      if (err.name === 'AbortError') {
        throw new Error(`Upstream 請求逾時 (${timeoutMs}ms): ${targetUrl}`);
      }
      throw err;
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheCount(): number {
    return this.cache.size;
  }
}
