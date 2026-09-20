function hitRate(stats) {
  const reads = stats.hits + stats.misses;
  return reads === 0 ? 0 : stats.hits / reads;
}
module.exports = { hitRate };
