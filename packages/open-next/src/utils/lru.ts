export class LRUCache<T> {
  private cache: Map<string, T> = new Map();

  constructor(private maxSize: number) {}

  get(key: string) {
    const result = this.cache.get(key);
    if (result) {
      this.cache.delete(key);
      this.cache.set(key, result);
    }
    return result;
  }

  set(key: string, value: any) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string) {
    this.cache.delete(key);
  }
}
