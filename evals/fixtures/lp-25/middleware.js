function invoke(handler, req) {
  handler(req);
}
module.exports = { invoke };
