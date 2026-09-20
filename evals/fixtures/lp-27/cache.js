class Cache {
  constructor() { this.store = new Map(); this.hits = 0; this.misses = 0; }
  set(key, value) { this.store.set(key, value); }
  get(key) {
    if (this.store.has(key)) { this.hits++; return this.store.get(key); }
    this.misses++; return null;
  }
  stats() { return { hits: this.hits, misses: this.misses, entries: this.store.size }; }
}
module.exports = { Cache };
