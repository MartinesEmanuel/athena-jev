const { normalizeUser } = require("./normalize");
const { mapUser } = require("./mapper");
function processUser(data) {
  const normalized = normalizeUser(data);
  const user = mapUser(normalized);
  return { ...user, valid: user.age > 0 && user.age < 150, sourceName: normalized.firstName };
}
module.exports = { processUser };
