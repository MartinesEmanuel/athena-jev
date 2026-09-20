const { byId } = require("./order");
function processRecords(records) {
  const seen = new Set();
  const result = [];
  for (const record of byId(records)) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}
module.exports = { processRecords };
