function decodeQuoted(value) {
  let output = "";
  for (let index = 0; index < value.length; index++) {
    const ch = value[index];
    if (ch !== "\\") {
      output += ch;
      continue;
    }
    if (index + 1 >= value.length) {
      output += "\\";
      continue;
    }
    const next = value[++index];
    if (next === "n") output += "\n";
    else if (next === "t") output += "\t";
    else if (next === '"' || next === "\\") output += next;
    else output += next;
  }
  return output;
}
module.exports = { decodeQuoted };
