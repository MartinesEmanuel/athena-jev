const { deltaStats } = require("./sampler");
const { hitRate } = require("./metrics");
function measureWindow(cache, keys) {
  const before = cache.stats();
  for (const key of keys) cache.get(key);
  const after = cache.stats();
  return hitRate(deltaStats(before, after));
}
module.exports = { measureWindow };
