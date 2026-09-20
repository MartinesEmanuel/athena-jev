function validatePassword(pw){if(!pw||pw.length<8)return {valid:false,error:"too short"}; if(pw.length>12)return {valid:false,error:"too long"}; return {valid:true};}
module.exports={validatePassword};
