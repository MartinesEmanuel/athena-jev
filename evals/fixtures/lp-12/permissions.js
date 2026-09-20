const allowed = new Set(["/reports"]);
function canAccess(path) { return allowed.has(path); }
module.exports = { canAccess };
