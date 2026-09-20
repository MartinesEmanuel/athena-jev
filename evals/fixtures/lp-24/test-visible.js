const {validateEmail}=require("./email"); if(!validateEmail("user@example.com")) process.exit(1); console.log("PASS");
