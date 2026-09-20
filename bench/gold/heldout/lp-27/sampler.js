function deltaStats(before, after) {
  return { hits: after.hits - before.hits, misses: after.misses - before.misses, entries: after.entries };
}
module.exports = { deltaStats };
