function sampleBatch() {
  return [
    { id: "a", status: "complete", value: "10" },
    { id: "b", status: "pending", value: "900" },
    { id: "c", status: "complete", value: 20 },
    { id: "d", status: "complete", value: "30" }
  ];
}
module.exports = { sampleBatch };
