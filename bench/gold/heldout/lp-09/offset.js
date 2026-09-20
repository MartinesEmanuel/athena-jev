function parseOffset(text) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw new Error("invalid offset");
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}
module.exports = { parseOffset };
