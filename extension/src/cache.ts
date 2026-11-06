/** Small TTL cache; returns new maps rather than mutating callers' data. */
export class TtlCache<V> {
  private store = new Map<string, { at: number; value: V }>();
  constructor(private readonly ttlMs: number, private readonly max = 50, private readonly now = () => Date.now()) {}
  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) { this.store.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, { at: this.now(), value });
    while (this.store.size > this.max) this.store.delete(this.store.keys().next().value as string);
  }
}
