const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {database,profiles,ids,domain,employees}=require('./helpers.cjs');
let db;
before(async()=>{db=await database();});after(async()=>{await db?.close();});
const commit=(state,revision=0,id=randomUUID(),actor=ids.manager,action='phase',week='2026-10-26')=>db.query('select commit_workspace($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor,action,id,week,revision,'test-'+id,state,{message:'saved'},Object.values(profiles).find(p=>p.id===actor).employee_id]);
test('migrations apply and all application tables have RLS enabled',async()=>{
  const rows=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;
  assert.equal(rows.length,12);assert(rows.every(r=>r.relrowsecurity));
});
test('normalized snapshot, atomic commit, idempotent retry and stale writes',async()=>{
  const state=domain.emptyState(employees);state.weekStatus=1;state.shifts['mon-after'].registered.push('NV01');
  const id=randomUUID();await commit(state,0,id);await commit(state,0,id);
  const snapshot=(await db.query("select workspace_snapshot('2026-10-26') as data")).rows[0].data;
  assert.equal(snapshot.revision,1);assert.deepEqual(snapshot.state.shifts['mon-after'].registered,['NV01']);
  assert.equal((await db.query('select count(*)::int as n from audit_logs')).rows[0].n,1);
  await assert.rejects(commit(state,0),{code:'40001'});
});
test('constraint failures roll back every part of a multi-step commit',async()=>{
  const state=domain.emptyState(employees);state.shifts['mon-morn'].registered=['NV01'];
  await assert.rejects(commit(state,1),{code:'23514'});
  assert.equal((await db.query("select revision from weekly_schedules where week_start='2026-10-26'")).rows[0].revision,1);
  assert.equal((await db.query("select count(*)::int as n from shift_registrations where employee_id='NV01'")).rows[0].n,1);
});
test('foreign keys, duplicate registrations, Monday and role mapping constraints',async()=>{
  await assert.rejects(db.query("insert into weekly_schedules(week_start) values('2026-10-27')"),{code:'23514'});
  await assert.rejects(db.query("insert into shift_registrations(week_start,shift_id,employee_id) values('2026-10-26','mon-after','NV01')"),{code:'23505'});
  await assert.rejects(db.query("insert into shift_assignments(week_start,shift_id,employee_id) values('2026-10-26','mon-after','NV99')"),{code:'23503'});
  await assert.rejects(db.query("update profiles set employee_id=null where id=$1",[ids.employee]),{code:'23514'});
});
async function asUser(id,sql,params=[]) {
  return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return tx.query(sql,params);});
}
test('RLS isolates employee records and disallows direct role escalation or writes',async()=>{
  const mine=await asUser(ids.employee,'select * from employees');assert.deepEqual(mine.rows.map(r=>r.id),['NV01']);
  const other=await asUser(ids.other,'select * from shift_registrations');assert.deepEqual(other.rows,[]);
  assert.equal((await asUser(ids.manager,'select * from employees')).rows.length,18);
  assert.equal((await asUser(ids.admin,'select * from employees')).rows.length,0);
  await assert.rejects(asUser(ids.employee,"update profiles set role='admin' where id=$1",[ids.employee]),{code:'42501'});
  await assert.rejects(asUser(ids.manager,"delete from shift_registrations"),{code:'42501'});
  await assert.rejects(asUser(ids.employee,"select workspace_snapshot('2026-10-26')"),{code:'42501'});
  await assert.rejects(asUser(ids.employee,'select * from web_sessions'),{code:'42501'});
});
test('anonymous users cannot read application data',async()=>{await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');return tx.query('select * from profiles');}),{code:'42501'});});
test('commit rechecks actor privileges and rejects employee scheduling',async()=>{await assert.rejects(commit(domain.emptyState(employees),1,randomUUID(),ids.employee,'generate'),{code:'42501'});});
test('admin role assignment is audited, blocks self-administration and revokes inactive sessions',async()=>{
  await db.query("insert into web_sessions(id,user_id,encrypted_tokens,expires_at) values($1,$2,'encrypted',now()+interval '1 hour')",['a'.repeat(64),ids.other]);
  await db.query('select manage_profile($1,$2,$3,$4,$5,$6,$7,$8)',[ids.admin,ids.other,profiles.other.phone,'Nhân viên thử nghiệm','employee','NV02',false,randomUUID()]);
  assert.equal((await db.query('select count(*)::int as n from web_sessions')).rows[0].n,0);
  await assert.rejects(db.query('select manage_profile($1,$1,$2,$3,$4,null,true,$5)',[ids.admin,profiles.admin.phone,'Admin','manager',randomUUID()]),{code:'42501'});
  assert.equal((await db.query("select count(*)::int as n from audit_logs where action='account_update'")).rows[0].n,1);
});
test('persistent login rate limit is atomic and denies excess attempts',async()=>{for(let i=0;i<3;i++)assert.equal((await db.query("select consume_login_limit('test-ip',3) as allowed")).rows[0].allowed,true);assert.equal((await db.query("select consume_login_limit('test-ip',3) as allowed")).rows[0].allowed,false);});
test('approval status, assignment changes and audit trail commit together; duplicate approval is rejected',async()=>{
 const week='2026-11-09';let state=require('../../scripts/submitted-demo.cjs')();state.weekStatus=1;domain.engine(state,employees).runSchedulingAlgorithm();state.weekStatus=4;
 await commit(state,0,randomUUID(),ids.manager,'phase',week);
 const {applyAction}=require('../../server/workflows.cjs');
 const key=Object.values(state.shifts).find(s=>s.assigned.includes('NV01')).id,requestId=randomUUID();
 state=applyAction({state,employees},profiles.employee,'request',{shiftId:key,type:'leave',reason:'Bận lịch thi'},requestId).state;
 await commit(state,1,requestId,ids.employee,'request',week);
 const approved=applyAction({state,employees},profiles.manager,'approve',{requestId});
 await commit(approved.state,2,randomUUID(),ids.manager,'approve',week);
 assert.equal((await db.query('select result from approval_history where request_id=$1',[requestId])).rows[0].result,'ĐÃ DUYỆT');
 assert.equal((await db.query('select status from change_requests where id=$1',[requestId])).rows[0].status,'ĐÃ DUYỆT');
 assert.equal((await db.query('select count(*)::int as n from shift_assignments where week_start=$1 and shift_id=$2 and employee_id=$3',[week,key,'NV01'])).rows[0].n,0);
 await assert.rejects(commit(approved.state,2,randomUUID(),ids.manager,'approve',week),{code:'40001'});
});
test('database files persist across a database restart',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'2ce-persistence-'));
 let store;
 try {store=new PGlite(directory);await store.exec('create table persistence_probe(id integer primary key, value text not null); insert into persistence_probe values(1,\'saved\');');await store.close();store=new PGlite(directory);assert.equal((await store.query('select value from persistence_probe where id=1')).rows[0].value,'saved');await store.close();store=null;}
 finally {if(store)await store.close();await fs.rm(directory,{recursive:true,force:true});}
});
