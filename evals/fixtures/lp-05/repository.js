const records = new Map([["a", { value: "hello", revision: 1 }]]);
function get(id) { const record = records.get(id); return record ? { ...record } : null; }
function update(id, value) { const prev = records.get(id); records.set(id, { value, revision: (prev?.revision || 0) + 1 }); }
function revision(id) { return records.get(id)?.revision ?? null; }
module.exports = { get, update, revision };
