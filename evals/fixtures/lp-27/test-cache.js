const { Cache } = require("./cache");
const { measureWindow } = require("./dashboard");
const fresh = new Cache(); fresh.set("a", 1);
if (measureWindow(fresh, ["a", "missing"]) !== 0.5) throw new Error("fresh window failed");
const warm = new Cache(); warm.set("a", 1); warm.get("old-miss");
if (measureWindow(warm, ["a", "missing"]) !== 0.5) throw new Error("warm window drifted");
console.log("PASS");
