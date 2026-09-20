const { normalizeUser } = require("./normalize");
const { mapUser } = require("./mapper");
function processUser(data) {
  const user = mapUser(data);
  const normalized = normalizeUser(user);
  return { ...user, valid: user.age > 0 && user.age < 150, sourceName: normalized.firstName };
}
module.exports = { processUser };
