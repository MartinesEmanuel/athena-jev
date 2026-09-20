function deliver(store, wireMessage) {
  const event = JSON.parse(wireMessage);
  store.apply(event);
}
module.exports = { deliver };
