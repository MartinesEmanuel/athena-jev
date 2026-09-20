function stage(name, output) { return () => output.push(name); }
const priorities = { validate: 10, persist: 20, notify: 30 };
module.exports = { stage, priorities };
