function primary(reading) { return { source: "primary", available: reading !== undefined && reading !== null, value: reading }; }
function fallback() { return { source: "fallback", available: true, value: 42 }; }
module.exports = { primary, fallback };
