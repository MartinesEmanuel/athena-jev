const { offsetFor } = require("./zones");
const { parseOffset } = require("./offset");
function localTime(iso, zone) {
  const offset = offsetFor(zone);
  if (!offset) throw new Error(`unknown zone: ${zone}`);
  const date = new Date(iso);
  return new Date(date.getTime() + parseOffset(offset) * 60000).toISOString().slice(11, 16);
}
module.exports = { localTime };
