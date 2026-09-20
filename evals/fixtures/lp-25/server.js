const { invoke } = require("./middleware");
function createServer(handler) {
  return {
    handle(req) {
      if (!req.headers?.["content-type"]) return { error: "missing content-type" };
      return invoke(handler, req);
    }
  };
}
module.exports = { createServer };
