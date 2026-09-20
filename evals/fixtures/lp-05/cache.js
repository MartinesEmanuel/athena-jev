const cache = new Map();
function get(key) { return cache.get(key); }
function has(key) { return cache.has(key); }
function set(key, value) { cache.set(key, value); }
function clear() { cache.clear(); }
module.exports = { get, has, set, clear };
