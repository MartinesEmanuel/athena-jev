function customSort(arr){const result=[...arr]; for(let i=0;i<result.length;i++){for(let j=0;j<result.length-i-1;j++){if(result[j]>result[j+1]){const temp=result[j]; result[j]=result[j+1]; result[j+1]=temp;}}} return result;}
module.exports={customSort};
