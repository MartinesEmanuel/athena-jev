const { chooseLatest } = require("./selector");
const { available } = require("./snapshots");
function startupSnapshot() { return chooseLatest(available()); }
module.exports = { startupSnapshot };
