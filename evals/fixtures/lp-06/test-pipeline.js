const { runLifecycle } = require("./pipeline");
const result = runLifecycle();
if (JSON.stringify(result) !== JSON.stringify(["validate", "persist", "notify"])) throw new Error(result.join(" -> "));
console.log("PASS");
