const { publicUser, internalUser } = require("./serializers");
function serializerFor(mode) {
  if (mode === "internal") return internalUser;
  return publicUser;
}
module.exports = { serializerFor };
