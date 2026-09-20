const {validate}=require("./schema");
if(!validate({name:"A",age:30,email:"a@b.com"}).valid) process.exit(1);
console.log("PASS");
