const {getField}=require("./parser"); if(getField("{\"a\":1}","a")!==1) process.exit(1); console.log("PASS");
