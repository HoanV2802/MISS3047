'use strict';
// The supplied demo represents 18 submitted forms. Their historical submission
// times are unknown; equal/unknown priorities resolve by employee ID.
const {submitDraft} = require('../server/planning.cjs');
module.exports = function submittedDemo() {
  const state = structuredClone(require('./demo-data.json'));
  for (const [id, reg] of Object.entries(state.registrations)) {
    if (reg.isSubmitted) submitDraft(state, id, null);
  }
  return state;
};
