const path = require("path");
const { loadDatabaseTarget } = require("./service");
const target = loadDatabaseTarget(path.join(__dirname, "config.ini"));
if (target.port !== 5432) throw new Error("port did not load");
if (target.host !== "C:\\Users\\admin\\data") throw new Error(`unexpected runtime path: ${target.host}`);
console.log("PASS");
