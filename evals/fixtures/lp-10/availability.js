function firstUsable(candidates) {
  return candidates.find((candidate) => candidate && candidate.available && Boolean(candidate.value)) || null;
}
module.exports = { firstUsable };
