function normalizeRecord(record) {
  const amount = typeof record.value === "number" ? record.value : Number(record.value);
  return {
    id: record.id,
    included: record.status === "complete" && Number.isFinite(amount),
    amount
  };
}
module.exports = { normalizeRecord };
