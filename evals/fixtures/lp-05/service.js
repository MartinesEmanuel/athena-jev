const repository = require("./repository");
const cache = require("./cache");
function readUpper(id) {
  if (cache.has(id)) return cache.get(id);
  const record = repository.get(id);
  if (!record) return null;
  const result = record.value.toUpperCase();
  cache.set(id, result);
  return result;
}
module.exports = { readUpper };
