const { buildReport } = require("./report");
const report = buildReport([
  { id: "a", status: "complete", value: "10" },
  { id: "b", status: "complete", value: 20 },
  { id: "c", status: "complete", value: "30" }
]);
if (report.count !== 3 || report.average !== 20) throw new Error(JSON.stringify(report));
console.log("PASS");
