'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { domain, employees, DatabaseBackend, profiles, invoke } = require('../backend/helpers.cjs');
const { createHandler } = require('../../server/handler.cjs');
const { applyAction } = require('../../server/workflows.cjs');

test('the supplied local Auth configuration disables public signup at every provider entry', () => {
  const lines = fs.readFileSync(path.join(__dirname, '../../supabase/config.toml'), 'utf8').split(/\r?\n/);
  let section;
  const flags = {};
  for (const line of lines) {
    if (line.startsWith('[')) section = line.trim();
    const match = /^enable_signup\s*=\s*(true|false)\s*$/.exec(line);
    if (match) flags[section] = match[1];
  }
  for (const name of ['[auth]', '[auth.email]', '[auth.sms]']) assert.equal(flags[name], 'false', name);
});

test('offline admin cannot receive a successful save response from a read-only adapter', async () => {
  const backend = new DatabaseBackend(null);
  const { session } = await backend.login(profiles.admin.phone, backend.loginPassword);
  const api = createHandler({ backend, origin: 'http://localhost:4173' });
  const response = await invoke(api, { method: 'POST', url: '/api/admin', cookie: '2ce_session=' + session, body: {} });
  assert.equal(response.status, 501);
  assert.match(response.data.error, /chưa được lưu/);
  assert.equal(response.data.message, undefined);
});

test('a small eligible roster may receive adjacent shifts but never overlapping intervals in the current templates', () => {
  const state = domain.emptyState(employees);
  state.weekStatus = 1;
  const available = employees.filter(e => ['NV01','NV02','NV07','NV08','NV10','NV11','NV12'].includes(e.id));
  for (const shift of Object.values(state.shifts)) {
    shift.registered = available.filter(e => domain.engine(state, employees).isDeptAllowed(e.dept, shift.shiftKey)).map(e => e.id);
  }
  for (const person of available) require('../../server/planning.cjs').submitDraft(state,person.id,1);
  const plan = applyAction({ state, employees }, profiles.manager, 'generate', {}, randomUUID()).state;
  assert.equal(plan.weekStatus, 4);
  let adjacent = false;
  for (const person of employees) {
    for (const day of domain.DAYS) {
      const times = domain.SHIFT_CONFIGS.filter(c => plan.shifts[day.key + '-' + c.key].assigned.includes(person.id))
        .map(c => c.hours.split(' - ')).sort(([a], [b]) => a.localeCompare(b));
      for (let i = 1; i < times.length; i++) {
        assert(times[i-1][1] <= times[i][0]);
        if (times[i-1][1] === times[i][0]) adjacent = true;
      }
    }
  }
  assert(adjacent);
});
