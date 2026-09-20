const { getConfig } = require("./config");
if (getConfig("database.host") !== "localhost") throw new Error("existing path failed");
if (getConfig("features.release\\.channel.enabled") !== true) throw new Error("escaped-dot syntax failed");
if (getConfig("features.beta.rollout.percent") !== undefined) throw new Error("missing path should be undefined");
console.log("PASS");
