function validateEmail(email){const regex=/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i; return regex.test(email);}
module.exports={validateEmail};
