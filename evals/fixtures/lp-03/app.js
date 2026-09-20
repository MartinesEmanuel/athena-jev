const { createLogger } = require("./logger");
const { collectDiagnostics } = require("./collector");
function reproduceFailure(logDir) {
  const logger = createLogger(logDir);
  logger.error("request failed");
  return collectDiagnostics(logDir);
}
module.exports = { reproduceFailure };
