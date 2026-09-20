const repository = require("./repository");
const cache = require("./cache");
function readUpper(id) {
  const rev = repository.revision(id);
  if (rev == null) return null;
  const key = `${id}:${rev}`;
  if (cache.has(key)) return cache.get(key);
  const record = repository.get(id);
  const result = record.value.toUpperCase();
  cache.set(key, result);
  return result;
}
module.exports = { readUpper };
