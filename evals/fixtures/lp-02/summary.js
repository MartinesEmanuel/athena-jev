const { buildWindow } = require("./window");
function averageCompleted(records) {
  const window = buildWindow(records);
  const included = window.observations.filter((item) => item.included);
  if (included.length === 0) return 0;
  const total = included.reduce((sum, item) => sum + item.amount, 0);
  return total / window.transportCount;
}
module.exports = { averageCompleted };
