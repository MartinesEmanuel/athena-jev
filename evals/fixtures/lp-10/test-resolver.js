const { resolveReading } = require("./resolver");
if (resolveReading(7) !== 7) throw new Error("positive primary failed");
if (resolveReading(undefined) !== 42) throw new Error("fallback failed");
if (resolveReading(0) !== 0) throw new Error("zero reading was replaced");
console.log("PASS");
