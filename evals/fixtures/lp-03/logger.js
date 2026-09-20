const fs = require("fs");
const path = require("path");
function createLogger(logDir) {
  const artifactDir = path.join(logDir, "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  const errorFile = path.join(artifactDir, "errors.log");
  const manifest = { version: 2, artifacts: [{ kind: "error", path: path.relative(logDir, errorFile) }] };
  fs.writeFileSync(path.join(logDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { error(message) { fs.appendFileSync(errorFile, `[ERROR] ${message}\n`); } };
}
module.exports = { createLogger };
