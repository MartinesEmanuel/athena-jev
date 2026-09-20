const fs=require("fs"); function readFileSafe(path){try{return {data:fs.readFileSync(path,"utf8"),error:null};}catch(error){return {data:null,error:error.message};}}
module.exports={readFileSafe};
