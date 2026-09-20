const { chooseLatest } = require("./selector");
const { startupSnapshot } = require("./startup");
if (chooseLatest(["snapshot-7.json", "snapshot-9.json", "snapshot-8.json"]) !== "snapshot-9.json") throw new Error("single-digit selection failed");
if (startupSnapshot() !== "snapshot-10.json") throw new Error(`startup selected ${startupSnapshot()}`);
console.log("PASS");
