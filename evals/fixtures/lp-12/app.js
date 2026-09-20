const { route } = require("./router");
const { canAccess } = require("./permissions");
function request(path) { return { handler: route(path), allowed: canAccess(path) }; }
module.exports = { request };
