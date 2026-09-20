const { PROFILE_FIELDS } = require("./contract");
const { mapFields } = require("./field-map");
function adaptProfile(payload) {
  return { email: payload.email, ...mapFields(payload, PROFILE_FIELDS) };
}
module.exports = { adaptProfile };
