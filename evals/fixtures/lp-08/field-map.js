function mapFields(payload, fields) {
  const mapped = {};
  for (const [localName, wireName] of Object.entries(fields)) {
    mapped[wireName] = payload[localName];
  }
  return mapped;
}
module.exports = { mapFields };
