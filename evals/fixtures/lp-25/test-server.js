const { createServer } = require("./server");
const server = createServer(() => ({ status: "ok" }));
if (!server.handle({headers:{}}).error) { console.error("FAIL: invalid request"); process.exit(1); }
console.log("PASS");
