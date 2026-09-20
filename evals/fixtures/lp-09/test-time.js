const { localTime } = require("./formatter");
if (localTime("2026-09-19T10:00:00Z", "Etc/GMT-5") !== "15:00") throw new Error("whole-hour region failed");
if (localTime("2026-09-19T10:00:00Z", "Asia/Kolkata") !== "15:30") throw new Error("half-hour region failed");
console.log("PASS");
