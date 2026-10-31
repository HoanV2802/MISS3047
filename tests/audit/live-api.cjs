'use strict';
// This file does not run in test:audit. Cloud calls require explicit operator gates.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {liveBlockers}=require('./live-gate.cjs');
const read=liveBlockers(process.env,{api:true}),write=liveBlockers(process.env,{api:true,write:true});
const skip=reasons=>reasons.length?'BLOCKED: '+reasons.join(', '):false;
async function api(route,{cookie,body}={}){
 const origin=process.env.TEST_API_ORIGIN;
 const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{Origin:origin,'Content-Type':'application/json','X-2CE-Request':'1'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
 return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(role){const r=await api('/api/auth',{body:{action:'login',phone:process.env[`TEST_${role}_PHONE`],password:process.env[`TEST_${role}_PASSWORD`]}});assert.equal(r.status,200);assert(r.cookie);return r;}
test('LIVE API: real sessions, role enforcement, forged role, and logout replay',{skip:skip(read)},async()=>{
 const manager=await login('MANAGER'),employee=await login('EMPLOYEE');
 try{
  assert.equal((await api('/api/auth')).status,401);
  assert.equal((await api('/api/admin',{cookie:employee.cookie})).status,403);
  assert.equal((await api('/api/admin',{cookie:manager.cookie})).status,403);
  const week=process.env.TEST_WEEK||'2030-01-07';
  const forbidden={week,revision:0,requestId:randomUUID(),action:'generate',payload:{}};
  assert.equal((await api('/api/action',{cookie:employee.cookie,body:forbidden})).status,403);
  assert.equal((await api('/api/action',{cookie:employee.cookie,body:{...forbidden,role:'manager'}})).status,400);
  assert.equal((await api('/api/auth',{cookie:employee.cookie,body:{action:'logout'}})).status,200);
  assert.equal((await api('/api/auth',{cookie:employee.cookie})).status,401);
 }finally{await api('/api/auth',{cookie:manager.cookie,body:{action:'logout'}});await api('/api/auth',{cookie:employee.cookie,body:{action:'logout'}});}
});
test('LIVE API WRITE: a new dedicated week persists, duplicate/stale writes fail, approvals and audit are atomic',{skip:skip(write)},async()=>{
 const {SupabaseBackend}=require('../../server/supabase.cjs'),{week:validateWeek}=require('../../server/validation.cjs');
 const week=validateWeek(process.env.TEST_WEEK),backend=new SupabaseBackend();
 assert.equal((await backend.snapshot(week)).exists,false,'Choose a NEW unused test week; this test never resets existing data.');
 const manager=await login('MANAGER'),employee=await login('EMPLOYEE');
 try{
  const id=employee.data.profile.employee_id;
  let revision=0;
  const command=async(cookie,action,payload,requestId=randomUUID())=>{
   const body={week,revision,requestId,action,payload},result=await api('/api/action',{cookie,body});assert.equal(result.status,200);revision++;return body;
  };
  await command(manager.cookie,'phase',{status:1});
  const initial=await backend.snapshot(week),person=initial.employees.find(e=>e.id===id);
  const shiftIds=person.dept==='Phục vụ'?['mon-eve','tue-eve','thu-eve','sat-eve']:['mon-after','tue-eve','thu-eve','sat-eve'];
  for(const shiftId of shiftIds)await command(employee.cookie,'registration',{shiftId,selected:true});
  const replay=await command(employee.cookie,'submit',{});
  assert.equal((await api('/api/action',{cookie:employee.cookie,body:replay})).status,200);
  assert.equal((await api('/api/action',{cookie:employee.cookie,body:{...replay,requestId:randomUUID()}})).status,409);
  const reload=await api(`/api/workspace?week=${week}`,{cookie:employee.cookie});assert.equal(reload.status,200);assert.equal(Object.values(reload.data.state.shifts).filter(s=>s.registered.includes(id)).length,4);assert.deepEqual(Object.keys(reload.data.state.registrations),[id]);
  // Keep this existing staged workflow; step-2 regression is covered locally.
  await command(manager.cookie,'generate',{});await command(manager.cookie,'phase',{status:4,acceptMissing:true});
  const assigned=await backend.snapshot(week),mine=Object.values(assigned.state.shifts).find(s=>s.assigned.includes(id));assert(mine);
  const requestId=randomUUID();await command(employee.cookie,'request',{shiftId:mine.id,type:'leave',reason:'Dedicated staging integration test',targetShiftId:null},requestId);
  const approval=await command(manager.cookie,'approve',{requestId});
  assert.equal((await api('/api/action',{cookie:manager.cookie,body:approval})).status,200);
  const final=await backend.snapshot(week);assert.equal(final.state.changeRequests.find(r=>r.id===requestId).status,'ĐÃ DUYỆT');assert(!final.state.shifts[mine.id].assigned.includes(id));
  const history=await backend.request(`/rest/v1/approval_history?request_id=eq.${requestId}&select=request_id,result`,{service:true});assert.equal(history.length,1);assert.equal(history[0].result,'ĐÃ DUYỆT');
  const audit=await backend.operation(manager.data.profile.id,approval.requestId);assert(audit);
  console.log(`Created dedicated test week ${week}; no data was deleted or reset.`);
 }finally{await api('/api/auth',{cookie:manager.cookie,body:{action:'logout'}});await api('/api/auth',{cookie:employee.cookie,body:{action:'logout'}});}
});
