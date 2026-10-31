'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {database,DatabaseBackend,profiles,ids,invoke,domain,employees}=require('../backend/helpers.cjs');
const {createHandler}=require('../../server/handler.cjs'),{applyAction}=require('../../server/workflows.cjs'),{SupabaseBackend}=require('../../server/supabase.cjs');
let db,backend,handler;before(async()=>{db=await database();backend=new DatabaseBackend(db);handler=createHandler({backend,origin:'http://localhost:4173'});});after(async()=>{await db?.close();});
async function login(role){const r=await invoke(handler,{method:'POST',body:{action:'login',phone:profiles[role].phone,password:backend.loginPassword}});assert.equal(r.status,200);return r.headers['set-cookie'].split(';')[0];}
const command=(week,revision,action,payload={},requestId=randomUUID())=>({week,revision,action,payload,requestId});
test('all privileged SECURITY DEFINER RPCs deny anon/authenticated EXECUTE and pin search_path',async()=>{
 for(const name of['workspace_snapshot','commit_workspace','consume_login_limit','manage_profile']){
  const result=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name])).rows[0];
  assert(result.prosecdef);assert.equal(result.anon,false);assert.equal(result.authenticated,false);assert.equal(result.service,true);assert(result.proconfig.includes('search_path=""'));
 }
});
test('separate weeks keep independent phase, registrations and revisions',async()=>{
 const cookie=await login('manager');
 for(const week of['2026-11-16','2026-11-23'])assert.equal((await invoke(handler,{method:'POST',url:'/api/action',cookie,body:command(week,0,'phase',{status:1})})).status,200);
 const employee=await login('employee');assert.equal((await invoke(handler,{method:'POST',url:'/api/action',cookie:employee,body:command('2026-11-16',1,'registration',{shiftId:'mon-after',selected:true})})).status,200);
 const first=await backend.snapshot('2026-11-16'),second=await backend.snapshot('2026-11-23');assert.equal(first.revision,2);assert.equal(second.revision,1);assert(first.state.shifts['mon-after'].registered.includes('NV01'));assert.equal(second.state.shifts['mon-after'].registered.length,0);
});
test('two API writes at the same revision have one winner and one conflict, not a lost update',async()=>{
 const cookie=await login('manager'),week='2026-11-30';
 const results=await Promise.all([1,3].map(status=>invoke(handler,{method:'POST',url:'/api/action',cookie,body:command(week,0,'phase',{status})})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await backend.snapshot(week)).revision,1);
});
test('Supabase unavailability returns 503 without clearing a valid session or exposing details',async()=>{
 const {AppError}=require('../../server/validation.cjs');
 const unavailable=createHandler({origin:'https://fixture.test',backend:{async authenticate(){throw new AppError(503,'Dịch vụ chưa sẵn sàng.');}}});
 const r=await invoke(unavailable,{origin:'https://fixture.test',cookie:'__Host-2ce_session=fixture'});assert.equal(r.status,503);assert.equal(r.headers['set-cookie'],undefined);assert(!JSON.stringify(r.data).includes('stack'));
 const client=new SupabaseBackend({url:'https://fixture.test',publicKey:'sb_publishable_fixture',secretKey:'sb_secret_fixture'},async()=>{throw new Error('private network detail');});
 await assert.rejects(client.request('/auth/v1/user'),e=>e.status===503&&!e.message.includes('private network detail'));
});
test('current business behavior is recorded: manager can skip to phase 3 and publish an empty schedule with acceptance',()=>{
 const snapshot={state:domain.emptyState(employees),employees};snapshot.state.weekStatus=1;
 assert.equal(applyAction(snapshot,profiles.manager,'phase',{status:3},randomUUID()).state.weekStatus,3);
 const published=applyAction(snapshot,profiles.manager,'phase',{status:4,acceptMissing:true},randomUUID());assert.equal(published.state.weekStatus,4);assert(Object.values(published.state.shifts).every(s=>s.assigned.length===0));
});
