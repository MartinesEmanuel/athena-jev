const { loadProfile } = require("./client");
const profile = loadProfile();
if (profile.email !== "a@example.com") throw new Error("email transport failed");
if (profile.displayName !== "Alice" || profile.phone !== "555-1234") throw new Error(JSON.stringify(profile));
console.log("PASS");
