class EventBus {
  constructor() { this.listeners = new Map(); this.sequence = 0; }
  on(event, fn, options = {}) {
    const entry = { fn, priority: options.priority ?? 100, sequence: this.sequence++ };
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(entry);
  }
  emit(event, value) {
    const listeners = [...(this.listeners.get(event) || [])];
    listeners.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    for (const entry of listeners) entry.fn(value);
  }
}
module.exports = { EventBus };
