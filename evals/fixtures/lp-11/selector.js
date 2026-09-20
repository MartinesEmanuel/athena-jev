const { parseSnapshot } = require("./catalog");
function chooseLatest(names) {
  const candidates = names.map(parseSnapshot).filter(Boolean);
  candidates.sort((left, right) => left.revision.localeCompare(right.revision));
  return candidates.at(-1)?.name ?? null;
}
module.exports = { chooseLatest };
