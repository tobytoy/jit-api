import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { TenantDefinition, UserRole } from './types.js';

export class TenantStore {
  private tenantsDir: string;
  private tenantsFile: string;
  private tenants: Map<string, TenantDefinition> = new Map();
  private keyIndex: Map<string, string> = new Map(); // apiKey -> tenantId
  private lineIndex: Map<string, string> = new Map(); // lineUserId -> tenantId

  constructor(storageDirOrFile?: string) {
    if (storageDirOrFile && storageDirOrFile.endsWith('.json')) {
      this.tenantsFile = storageDirOrFile;
      this.tenantsDir = path.dirname(storageDirOrFile);
    } else {
      this.tenantsDir = storageDirOrFile || path.resolve(process.cwd(), '.jit');
      this.tenantsFile = path.join(this.tenantsDir, 'tenants.json');
    }

    this.initDefaultTenants();
    this.loadFromDisk();
  }

  private initDefaultTenants(): void {
    const defaults: TenantDefinition[] = [
      {
        id: 'tnt_master',
        name: 'Master Core Admin',
        role: 'master',
        apiKey: 'jit_master_adminkey_local',
        allowedRoutes: ['*'],
        rateLimit: { windowSeconds: 60, maxRequests: 1000 },
        lineUserId: 'U_DEV_LEAD',
        company: 'JIT Protocol Core',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tnt_pm_carol',
        name: 'Product Manager Carol',
        role: 'pm',
        apiKey: 'jit_pm_carol_devkey',
        allowedRoutes: ['*'],
        rateLimit: { windowSeconds: 60, maxRequests: 200 },
        lineUserId: 'U_PM_CAROL',
        company: 'Product Ops',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tnt_client_alice',
        name: 'Client Partner Alice',
        role: 'client',
        apiKey: 'jit_client_alice_secret',
        allowedRoutes: ['/api/users'],
        rateLimit: { windowSeconds: 60, maxRequests: 30, dailyQuota: 500 },
        lineUserId: 'U_FRONTEND_ALICE',
        company: 'Partner Alice Corp',
        createdAt: new Date().toISOString(),
      },
    ];

    for (const t of defaults) {
      this.addTenant(t);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.tenantsFile)) {
        const raw = fs.readFileSync(this.tenantsFile, 'utf-8');
        const list: TenantDefinition[] = JSON.parse(raw);
        for (const t of list) {
          this.addTenant(t);
        }
      }
    } catch {
      // Ignored
    }
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(this.tenantsDir)) {
        fs.mkdirSync(this.tenantsDir, { recursive: true });
      }
      fs.writeFileSync(
        this.tenantsFile,
        JSON.stringify(Array.from(this.tenants.values()), null, 2),
        'utf-8'
      );
    } catch {
      // Ignored
    }
  }

  public addTenant(tenant: TenantDefinition): TenantDefinition {
    this.tenants.set(tenant.id, tenant);
    this.keyIndex.set(tenant.apiKey, tenant.id);
    if (tenant.lineUserId) {
      this.lineIndex.set(tenant.lineUserId, tenant.id);
    }
    return tenant;
  }

  public createTenant(params: {
    name: string;
    role: UserRole;
    allowedRoutes: string[];
    lineUserId?: string;
    company?: string;
    rateLimit?: { windowSeconds?: number; maxRequests?: number; dailyQuota?: number; requestsPerMinute?: number };
  }): TenantDefinition {
    const id = `tnt_${crypto.randomBytes(6).toString('hex')}`;
    const apiKey = `jit_${params.role}_${crypto.randomBytes(12).toString('hex')}`;
    const rateLimit = {
      windowSeconds: params.rateLimit?.windowSeconds || 60,
      maxRequests: params.rateLimit?.maxRequests || params.rateLimit?.requestsPerMinute || 60,
      dailyQuota: params.rateLimit?.dailyQuota,
    };
    const tenant: TenantDefinition = {
      id,
      name: params.name,
      role: params.role,
      apiKey,
      allowedRoutes: params.allowedRoutes.length > 0 ? params.allowedRoutes : ['*'],
      rateLimit,
      lineUserId: params.lineUserId,
      company: params.company,
      createdAt: new Date().toISOString(),
    };

    this.addTenant(tenant);
    this.saveToDisk();
    return tenant;
  }

  public listTenants(): TenantDefinition[] {
    return Array.from(this.tenants.values());
  }

  public getTenant(id: string): TenantDefinition | undefined {
    return this.tenants.get(id);
  }

  public getTenantByApiKey(apiKey: string): TenantDefinition | undefined {
    const id = this.keyIndex.get(apiKey.trim());
    return id ? this.tenants.get(id) : undefined;
  }

  public findByApiKey(apiKey: string): TenantDefinition | undefined {
    return this.getTenantByApiKey(apiKey);
  }

  public getTenantByLineId(lineUserId: string): TenantDefinition | undefined {
    const id = this.lineIndex.get(lineUserId.trim());
    return id ? this.tenants.get(id) : undefined;
  }

  public deleteTenant(id: string): boolean {
    const existing = this.tenants.get(id);
    if (!existing) return false;
    this.keyIndex.delete(existing.apiKey);
    if (existing.lineUserId) this.lineIndex.delete(existing.lineUserId);
    const deleted = this.tenants.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  public isRouteAllowed(tenant: TenantDefinition, route: string): boolean {
    if (tenant.role === 'master' || tenant.role === 'dev' || tenant.role === 'pm') return true;
    if (tenant.allowedRoutes.includes('*')) return true;
    return tenant.allowedRoutes.includes(route);
  }
}
