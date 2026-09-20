const { isWithinRange } = require("./validator");
if (!isWithinRange(5,1,10)) process.exit(1);
console.log("PASS");
