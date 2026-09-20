function formatName(first, last) { return `${first} ${last}`; }
function parseAge(value) { return Number.parseInt(value, 10); }
module.exports = { formatName, parseAge };
