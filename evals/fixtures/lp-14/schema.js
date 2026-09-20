const schema={required:["name","age"],properties:{name:{type:"string"},age:{type:"number"},email:{type:"string"}}};
function validate(data){for(const field of schema.required){if(!(field in data)) return {valid:false,error:"missing "+field};} return {valid:true};}
module.exports={schema,validate};
