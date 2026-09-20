const users = { 1: { id: 1, name: "Alice" }, 2: { id: 2, name: "Bob" } };
function findUser(id) { return users[id] || null; }
module.exports = { findUser };
