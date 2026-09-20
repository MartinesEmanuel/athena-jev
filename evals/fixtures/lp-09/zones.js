const OFFSETS = {
  "Etc/GMT-5": "+05:00",
  "Asia/Kolkata": "+05:30",
  "America/St_Johns": "-03:30"
};
function offsetFor(zone) { return OFFSETS[zone]; }
module.exports = { offsetFor };
