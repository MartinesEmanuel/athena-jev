const { splitPath } = require("./path");
function resolvePath(object, path) {
  let current = object;
  for (const part of splitPath(path)) {
    if (Object.prototype.hasOwnProperty.call(current, part)) current = current[part];
    else current = undefined;
  }
  return current;
}
module.exports = { resolvePath };
