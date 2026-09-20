const { fetchProfile } = require("./server");
const { adaptProfile } = require("./adapter");
function loadProfile() { return adaptProfile(fetchProfile()); }
module.exports = { loadProfile };
