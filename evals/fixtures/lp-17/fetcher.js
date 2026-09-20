function getSecondElement(arr){if(!arr||arr.length<2)return null; return arr[1];}
function getLastElement(arr){if(!arr||arr.length===0)return null; return arr[arr.length];}
module.exports={getSecondElement,getLastElement};
