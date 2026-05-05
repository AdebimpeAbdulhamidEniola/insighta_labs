// src/lib/cache.ts

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number = 3600) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    // Key doesn't exist
    if (!entry) return null;

    // Key exists but has expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(): void {
    this.store.clear();
  }
}

export const profileCache = new InMemoryCache(3600); // Cache entries expire after 1 hour