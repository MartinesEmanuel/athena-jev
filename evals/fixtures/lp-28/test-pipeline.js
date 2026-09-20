const { processRecords } = require("./pipeline");
const out=processRecords([{id:2,name:"b"},{id:3,name:"d"}]); if(out.length!==2) process.exit(1); console.log("PASS");
