const { Store } = require("./store");
const { deliver } = require("./consumer");
const store = new Store();
const msg = JSON.stringify({ id: "m-1", amount: 10 });
deliver(store, msg);
if (store.balance !== 10) { console.error("FAIL: first delivery"); process.exit(1); }
console.log("PASS");
