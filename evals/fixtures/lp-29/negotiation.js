const { publicUser, internalUser } = require("./serializers");
function serializerFor(mode) {
  if (mode === "public") return publicUser;
  if (mode === "internal") return internalUser;
  return internalUser;
}
module.exports = { serializerFor };
