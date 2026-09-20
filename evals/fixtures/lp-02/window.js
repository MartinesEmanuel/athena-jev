const { normalizeRecord } = require("./normalize");
function buildWindow(records) {
  return {
    observations: records.map(normalizeRecord),
    transportCount: records.length
  };
}
module.exports = { buildWindow };
