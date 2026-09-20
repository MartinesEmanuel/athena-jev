const { normalizePath } = require("./router");
const allowed = new Set(["/reports"]);
function canAccess(path) { return allowed.has(normalizePath(path)); }
module.exports = { canAccess };
