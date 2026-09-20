function encode(str){return Buffer.from(str).toString("base64");}
function decode(encoded){return Buffer.from(encoded,"base64").toString("utf8");}
module.exports={encode,decode};
