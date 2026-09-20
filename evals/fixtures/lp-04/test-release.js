const dev = require("./src/index");
const release = require("./release");
if (dev.getBuildChannel() !== release.getBuildChannel()) { console.error("FAIL: channel mismatch"); process.exit(1); }
if (typeof release.getVersion() !== "string") { console.error("FAIL: version missing"); process.exit(1); }
console.log("PASS");
