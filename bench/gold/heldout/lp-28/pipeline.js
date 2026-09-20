function processRecords(records) {
  const latest = new Map();
  for (const record of records) latest.set(record.id, record);
  return [...latest.values()];
}
module.exports = { processRecords };
