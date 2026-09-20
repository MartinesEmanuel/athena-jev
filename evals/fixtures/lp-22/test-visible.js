const {parseCSV}=require("./csv"); if(!Array.isArray(parseCSV("a,b"))) process.exit(1); console.log("PASS");
