'use strict';

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const manifest = require('../../../../assets/data/recruitment/roles.v1.json');
const schema = require('../../../../assets/data/recruitment/roles.v1.schema.json');

let valid;

function loadManifest() {
  if (!valid) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(manifest)) {
      const error = new Error('bundled recruitment manifest invalid');
      error.details = validate.errors;
      throw error;
    }
    valid = true;
  }
  return manifest;
}

module.exports = { loadManifest };
