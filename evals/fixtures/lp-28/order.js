function byId(records) { return [...records].sort((a,b) => a.id - b.id); }
module.exports = { byId };
