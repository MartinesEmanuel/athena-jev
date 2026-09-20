function parseOffset(text) {
  if (!/^[+-]\d{2}:\d{2}$/.test(text)) throw new Error("invalid offset");
  const decimalHours = Number(text.replace(":", "."));
  return Math.round(decimalHours * 60);
}
module.exports = { parseOffset };
