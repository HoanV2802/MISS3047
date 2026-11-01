'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHandler } = require('../../server/handler.cjs');
const { database, DatabaseBackend, profiles, ids, invoke } = require('./helpers.cjs');

const week = '2030-01-07';
let db, backend, handler, employeeCookie;

function command(revision, action, payload) {
  return { week, revision, requestId: randomUUID(), action, payload };
}
const post = (cookie, body) => invoke(handler, { method: 'POST', url: '/api/action', cookie, body });
async function cookie(role) {
  const r = await backend.login(profiles[role].phone, backend.loginPassword);
  return '2ce_session=' + r.session;
}
beforeEach(async () => {
  db = await database();
  backend = new DatabaseBackend(db);
  // Fake only the session. Like SupabaseBackend.authenticate, read the current
  // profile on each HTTP request; otherwise a new request would use a stale fixture.
  const sessionProfile = backend.authenticate.bind(backend);
  backend.authenticate = async token => {
    const { id } = await sessionProfile(token);
    return (await db.query('select * from profiles where id=$1', [id])).rows[0];
  };
  handler = createHandler({ backend, origin: 'http://localhost:4173' });
  employeeCookie = await cookie('employee');
  assert.equal((await post(await cookie('manager'), command(0, 'phase', { status: 1 }))).status, 200);
});
afterEach(async () => { await db.close(); });

const register = () => command(1, 'registration', { shiftId: 'wed-after', selected: true });
async function remap({ employee = 'NV03', role = 'employee', active = true } = {}) {
  await db.query('select manage_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
    ids.admin, ids.employee, profiles.employee.phone, 'Nhân viên thử nghiệm',
    role, employee, active, randomUUID()
  ]);
}
async function schedule() {
  const snapshot = await backend.snapshot(week);
  const rows = (await db.query('select request_id from audit_logs where week_start=$1 and actor=$2', [week, ids.employee])).rows;
  return { revision: snapshot.revision, registered: snapshot.state.shifts['wed-after'].registered, writes: rows.length };
}
// Keep a real in-flight request at the last boundary before SQL. The mutation
// and the eventual commit both execute the installed RPCs, in a chosen order.
function holdNextCommit() {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const commit = backend.commit.bind(backend);
  backend.commit = async args => {
    backend.commit = commit;
    entered.resolve(args);
    await release.promise;
    return commit(args);
  };
  return { entered: entered.promise, release: release.resolve };
}

test('reassignment before commit rejects NV01 intent, with no week, registration or audit mutation', async () => {
  const gate = holdNextCommit();
  const pending = post(employeeCookie, register());
  try {
    assert.equal((await gate.entered).p_expected_employee_id, 'NV01');
    await remap();
  } finally { gate.release(); }
  assert.equal((await pending).status, 409);
  assert.deepEqual(await schedule(), { revision: 1, registered: [], writes: 0 });
  assert.equal((await post(employeeCookie, register())).status, 200);
  assert.deepEqual(await schedule(), { revision: 2, registered: ['NV03'], writes: 1 });
});

test('committed NV01 intent stays with NV01; reassignment cannot replay it as NV03', async () => {
  const original = register();
  assert.equal((await post(employeeCookie, original)).status, 200);
  const replayGate = holdNextCommit();
  const inFlightReplay = post(employeeCookie, original);
  try {
    const replay = await replayGate.entered;
    assert.equal(replay.p_state, null);
    await remap();
  } finally { replayGate.release(); }
  assert.equal((await inFlightReplay).status, 409);
  assert.equal((await post(employeeCookie, original)).status, 409);
  assert.deepEqual(await schedule(), { revision: 2, registered: ['NV01'], writes: 1 });
});

for (const [name, update] of [
  ['inactive account', {employee:'NV01', active:false}],
  ['role changed to manager', {employee:null, role:'manager'}]
]) test(name + ' cannot commit an already authenticated employee command', async () => {
  const gate = holdNextCommit();
  const pending = post(employeeCookie, register());
  try { await gate.entered; await remap(update); } finally { gate.release(); }
  assert.equal((await pending).status, 403);
  assert.deepEqual(await schedule(), { revision: 1, registered: [], writes: 0 });
});

test('only the bound service RPC is callable and the browser cannot supply an employee binding', async () => {
  const base = 'public.commit_workspace(uuid,text,uuid,date,integer,text,jsonb,jsonb';
  const grants = (await db.query(`select to_regprocedure($1) is null as old_gone,
    has_function_privilege('service_role',$2,'execute') as service_execute,
    has_function_privilege('authenticated',$2,'execute') as authenticated_execute,
    has_function_privilege('anon',$2,'execute') as anon_execute`, [base + ')', base + ',text)'])).rows[0];
  assert.deepEqual(grants, { old_gone:true, service_execute:true, authenticated_execute:false, anon_execute:false });
  const cmd = register();
  assert.equal((await post(employeeCookie, {...cmd, p_expected_employee_id:'NV03'})).status, 400);
  assert.equal((await post(employeeCookie, {...cmd, payload:{...cmd.payload, employee_id:'NV03'}})).status, 400);
  assert.equal((await post(employeeCookie, command(1,'generate',{}))).status, 403);
  for (const binding of [null, 'NV03']) {
    await assert.rejects(db.query('select commit_workspace($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [ids.employee,'registration',randomUUID(),week,1,'test',{}, {},binding]), {code:'40001'});
  }
  assert.deepEqual(await schedule(), { revision: 1, registered: [], writes: 0 });
});

test('upgrade from the supplementary schema preserves existing schedules, requests, audits and grants', async () => {
  const { readFile } = require('node:fs/promises');
  const path = require('node:path');
  const { domain, employees } = require('./helpers.cjs');
  const old = await database(undefined, '202611010001_supplement_requests.sql');
  try {
    const state = domain.emptyState(employees);
    state.weekStatus = 3;
    state.shifts['mon-after'].registered.push('NV01');
    state.shifts['mon-after'].assigned.push('NV01');
    state.changeRequests.push({id:randomUUID(), empId:'NV02', shiftId:'wed-after', targetShiftId:null,
      type:'Đăng ký bổ sung', reason:'fixture', status:'CHỜ DUYỆT', time:new Date().toISOString()});
    await old.query('select commit_workspace($1,$2,$3,$4,$5,$6,$7,$8)', [
      ids.manager, 'demo_seed', randomUUID(), week, 0, 'fixture', state, {message:'fixture'}
    ]);
    const read = async () => ({
      snapshot:(await old.query('select workspace_snapshot($1) as s', [week])).rows[0].s,
      audits:(await old.query('select * from audit_logs order by id')).rows
    });
    const before = await read();
    await old.exec(await readFile(path.join(__dirname, '../../supabase/migrations/202611010002_workspace_actor_binding.sql'), 'utf8'));
    assert.deepEqual(await read(), before);
    const client = new DatabaseBackend(old);
    const h = createHandler({backend:client, origin:'http://localhost:4173'});
    const { session } = await client.login(profiles.manager.phone, client.loginPassword);
    const decision = await invoke(h, {method:'POST', url:'/api/action', cookie:'2ce_session='+session,
      body:command(1, 'approve', {requestId:state.changeRequests[0].id})});
    assert.equal(decision.status, 200);
    assert.deepEqual((await client.snapshot(week)).state.shifts['wed-after'].assigned,['NV02']);
    assert.equal((await old.query('select result from approval_history')).rows[0].result, 'ĐÃ DUYỆT');
  } finally { await old.close(); }
});
