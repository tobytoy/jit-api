/**
 * JIT Protocol Synthesis Framework - Plugin Architecture & Lifecycle Manager
 */

import { AuthDefinition } from './types.js';

export interface AuthValidationResult {
  authenticated: boolean;
  user?: Record<string, any>;
  role?: string;
  error?: string;
}

export interface JITRouteEvent {
  route: string;
  phase: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  statusCode?: number;
}

export interface JITStorageAdapter {
  name: string;
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  list?(prefix?: string): Promise<string[]>;
}

export interface JITPluginContext {
  engine?: any;
  config?: Record<string, any>;
  storage?: JITStorageAdapter;
}

export interface JITPlugin {
  name: string;
  version?: string;
  description?: string;
  onInit?: (context: JITPluginContext) => void | Promise<void>;
  authValidator?: (
    tokenOrKey: string,
    authDef: AuthDefinition,
    req?: any
  ) => Promise<AuthValidationResult | null>;
  storageAdapter?: JITStorageAdapter;
  onRouteExecuted?: (event: JITRouteEvent) => void | Promise<void>;
}

/**
 * Built-in in-memory fallback storage adapter
 */
export class MemoryStorageAdapter implements JITStorageAdapter {
  public name = 'memory';
  private store = new Map<string, { value: any; expiresAt?: number }>();

  async get<T = any>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.store.keys());
    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }
}

/**
 * JIT Plugin Manager
 */
export class PluginManager {
  private plugins = new Map<string, JITPlugin>();
  private storageAdapter: JITStorageAdapter = new MemoryStorageAdapter();

  constructor() {}

  /**
   * Register a plugin
   */
  public register(plugin: JITPlugin): this {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginManager] Overwriting existing plugin: ${plugin.name}`);
    }
    this.plugins.set(plugin.name, plugin);

    // If plugin provides a storage adapter, adopt it
    if (plugin.storageAdapter) {
      this.storageAdapter = plugin.storageAdapter;
    }
    return this;
  }

  /**
   * Unregister a plugin by name
   */
  public unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  /**
   * Get registered plugin
   */
  public get(name: string): JITPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all registered plugins
   */
  public list(): JITPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Set storage adapter manually
   */
  public setStorageAdapter(adapter: JITStorageAdapter): void {
    this.storageAdapter = adapter;
  }

  /**
   * Get current storage adapter
   */
  public getStorageAdapter(): JITStorageAdapter {
    return this.storageAdapter;
  }

  /**
   * Initialize all plugins
   */
  public async initAll(context: JITPluginContext): Promise<void> {
    const ctx: JITPluginContext = {
      ...context,
      storage: this.storageAdapter,
    };
    for (const plugin of this.plugins.values()) {
      if (plugin.onInit) {
        try {
          await plugin.onInit(ctx);
        } catch (err) {
          console.error(`[PluginManager] Failed to initialize plugin '${plugin.name}':`, err);
        }
      }
    }
  }

  /**
   * Execute auth validation across plugins
   */
  public async validateAuth(
    tokenOrKey: string,
    authDef: AuthDefinition,
    req?: any
  ): Promise<AuthValidationResult | null> {
    for (const plugin of this.plugins.values()) {
      if (plugin.authValidator) {
        try {
          const result = await plugin.authValidator(tokenOrKey, authDef, req);
          if (result !== null) {
            return result;
          }
        } catch (err: any) {
          return {
            authenticated: false,
            error: `Plugin '${plugin.name}' auth error: ${err.message}`,
          };
        }
      }
    }
    return null;
  }

  /**
   * Notify plugins of route execution
   */
  public async onRouteExecuted(event: JITRouteEvent): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onRouteExecuted) {
        try {
          await plugin.onRouteExecuted(event);
        } catch (err) {
          console.error(`[PluginManager] Error in plugin '${plugin.name}' onRouteExecuted:`, err);
        }
      }
    }
  }
}
