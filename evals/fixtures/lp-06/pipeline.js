const { EventBus } = require("./event-bus");
const { stage, priorities } = require("./stages");
function runLifecycle() {
  const output = [];
  const bus = new EventBus();
  bus.on("commit", stage("validate", output), { priority: priorities.validate });
  bus.on("commit", stage("persist", output), { priority: priorities.persist });
  bus.on("commit", stage("notify", output), { priority: priorities.notify });
  bus.emit("commit");
  return output;
}
module.exports = { runLifecycle };
