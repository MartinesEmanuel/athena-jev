const {encode}=require("./codec"); if(typeof encode("hello")!=="string") process.exit(1); console.log("PASS");
