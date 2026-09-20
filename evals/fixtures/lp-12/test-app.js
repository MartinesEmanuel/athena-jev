const { request } = require("./app");
const plain = request("/reports");
if (!plain.handler || !plain.allowed) { console.error("FAIL: canonical route"); process.exit(1); }
console.log("PASS");
