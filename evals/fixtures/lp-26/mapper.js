const { formatName, parseAge } = require("./utils");
function mapUser(data) { return { name: formatName(data.firstName, data.lastName), age: parseAge(data.age) }; }
module.exports = { mapUser };
