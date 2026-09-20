const fs = require("fs");
const { parseConfig } = require("./parser");
function loadDatabaseTarget(file) {
  const config = parseConfig(fs.readFileSync(file, "utf8"));
  return { host: config.db_host, port: Number(config.db_port), mode: config.mode };
}
module.exports = { loadDatabaseTarget };
