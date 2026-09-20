const config = {
  database: { host: "localhost", port: 5432 },
  server: { port: 3000 },
  features: { "release.channel": { enabled: true } }
};
module.exports = { config };
