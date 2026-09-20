class Store {
  constructor() { this.balance = 0; this.seen = new Set(); }
  apply(event) {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.balance += event.amount;
  }
}
module.exports = { Store };
