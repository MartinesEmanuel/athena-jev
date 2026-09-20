function validateEmail(email){const regex=/^[a-z]+@[a-z]+\.[a-z]+$/; return regex.test(email);}
module.exports={validateEmail};
