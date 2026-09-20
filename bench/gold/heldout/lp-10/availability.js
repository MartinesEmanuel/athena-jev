function firstUsable(candidates) {
  return candidates.find((candidate) => candidate && candidate.available && candidate.value !== undefined && candidate.value !== null) || null;
}
module.exports = { firstUsable };
