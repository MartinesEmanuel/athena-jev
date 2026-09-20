const repository = require("./repository");
const cache = require("./cache");
const { readUpper } = require("./service");
cache.clear();
if (readUpper("a") !== "HELLO") { console.error("FAIL: initial read"); process.exit(1); }
repository.update("a", "world");
if (typeof readUpper("a") !== "string") { console.error("FAIL: read missing"); process.exit(1); }
console.log("PASS");
