function splitPath(path) {
  const parts = [];
  let current = "";
  let escaped = false;
  for (const ch of path) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === ".") { parts.push(current); current = ""; continue; }
    current += ch;
  }
  if (escaped) current += "\\";
  parts.push(current);
  return parts;
}
module.exports = { splitPath };
