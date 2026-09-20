function parseSnapshot(name) {
  const match = /^snapshot-(\d+)\.json$/.exec(name);
  return match ? { name, revision: match[1] } : null;
}
module.exports = { parseSnapshot };
