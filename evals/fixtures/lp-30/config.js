const { config } = require("./source");
const { resolvePath } = require("./resolver");
function getConfig(path) { return resolvePath(config, path); }
module.exports = { getConfig };
