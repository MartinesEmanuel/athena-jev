const { splitPath } = require("./path");
function resolvePath(object, path) {
  let current = object;
  for (const part of splitPath(path)) {
    if (current == null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}
module.exports = { resolvePath };
