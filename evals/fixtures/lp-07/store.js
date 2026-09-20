class Store {
  constructor() { this.balance = 0; this.seen = new Set(); }
  apply(event) {
    if (this.seen.has(event)) return;
    this.seen.add(event);
    this.balance += event.amount;
  }
}
module.exports = { Store };
