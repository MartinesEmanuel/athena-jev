function parseJSON(str){return JSON.parse(str);}
function getField(str,key){if(str==null) return null; const obj=parseJSON(str); return obj[key];}
module.exports={parseJSON,getField};
