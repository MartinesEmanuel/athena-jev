function mapFields(payload, fields) {
  const mapped = {};
  for (const [localName, wireName] of Object.entries(fields)) {
    mapped[localName] = payload[wireName];
  }
  return mapped;
}
module.exports = { mapFields };
