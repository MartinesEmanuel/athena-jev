const fs = require("fs");
const path = require("path");
function collectDiagnostics(logDir) {
  const manifestPath = path.join(logDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = manifest.artifacts?.find((item) => item.kind === "error");
  if (!entry) return null;
  const artifact = path.join(logDir, entry.path);
  return fs.existsSync(artifact) ? fs.readFileSync(artifact, "utf8") : null;
}
module.exports = { collectDiagnostics };
