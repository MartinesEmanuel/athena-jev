function normalizeUser(data) {
  return {
    firstName: data.firstName ?? data.first_name,
    lastName: data.lastName ?? data.last_name,
    age: data.age
  };
}
module.exports = { normalizeUser };
