const { decodeQuoted } = require("./value-codec");
function parseConfig(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = decodeQuoted(value.slice(1, -1));
    }
    result[key] = value;
  }
  return result;
}
module.exports = { parseConfig };
