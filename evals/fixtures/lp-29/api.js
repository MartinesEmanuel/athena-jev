const { findUser } = require("./model");
const { serializerFor } = require("./negotiation");
function getUser(id, mode) { return serializerFor(mode)(findUser(id)); }
module.exports = { getUser };
