function publicUser(user) { return user ? { name: user.name, userId: user.id } : null; }
function internalUser(user) { return user ? { name: user.name, uid: user.id } : null; }
module.exports = { publicUser, internalUser };
