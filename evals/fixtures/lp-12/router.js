function normalizePath(path) { return path.length > 1 ? path.replace(/\/+$/, "") : path; }
function route(path) { return normalizePath(path) === "/reports" ? "reports-handler" : null; }
module.exports = { normalizePath, route };
