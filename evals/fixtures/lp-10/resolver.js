const { primary, fallback } = require("./providers");
const { firstUsable } = require("./availability");
function resolveReading(reading) {
  const selected = firstUsable([primary(reading), fallback()]);
  return selected?.value;
}
module.exports = { resolveReading };
