const {validatePassword}=require("./password"); if(!validatePassword("abcdefgh").valid) process.exit(1); console.log("PASS");
