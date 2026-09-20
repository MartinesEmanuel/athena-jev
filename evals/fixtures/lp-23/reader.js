const fs=require("fs"); function readFileSafe(path){return {data:fs.readFileSync(path,"utf8"),error:null};}
module.exports={readFileSafe};
