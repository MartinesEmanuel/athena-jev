const { averageCompleted } = require("./summary");
function buildReport(records) {
  return { count: records.length, average: averageCompleted(records) };
}
module.exports = { buildReport };
