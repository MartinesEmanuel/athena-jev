const { normalizeUser } = require("./normalize");
const { mapUser } = require("./mapper");
const { processUser } = require("./api");
const imported = { first_name: "Alice", last_name: "Smith", age: "30" };
const normalized = normalizeUser(imported);
if (normalized.firstName !== "Alice" || mapUser(normalized).name !== "Alice Smith") throw new Error("components failed independently");
if (processUser(imported).name !== "Alice Smith") throw new Error(JSON.stringify(processUser(imported)));
console.log("PASS");
