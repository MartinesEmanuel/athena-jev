const { getUser } = require("./api");
if (getUser(1, "public").userId !== 1) throw new Error("explicit public mode failed");
if (getUser(1, "internal").uid !== 1) throw new Error("explicit internal mode failed");
if (getUser(1).userId !== 1) throw new Error(JSON.stringify(getUser(1)));
console.log("PASS");
