/**
 * A per-request cache that provides named Map instances.
 * Overrides can use this to store and share data within the scope of a single request
 * without polluting global state.
 *
 * Retrieve it from the ALS context:
 * ```ts
 * const store = globalThis.__openNextAls.getStore();
 * const myMap = store?.requestCache.getOrCreate<MyKey, MyValue>("my-override");
 * ```
 */
export class RequestCache {
  private _caches = new Map<string, Map<unknown, unknown>>();

  /**
   * Returns the Map registered under `key`.
   * If no Map exists yet for that key, a new empty Map is created, stored, and returned.
   * Repeated calls with the same key always return the **same** Map instance.
   */
  getOrCreate<K = unknown, V = unknown>(key: string): Map<K, V> {
    let cache = this._caches.get(key) as Map<K, V> | undefined;
    if (!cache) {
      cache = new Map<K, V>();
      this._caches.set(key, cache);
    }
    return cache;
  }
}
