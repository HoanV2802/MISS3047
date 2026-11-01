'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {applyAction}=require('../../server/workflows.cjs');
const {database,DatabaseBackend,profiles,invoke,domain,employees}=require('./helpers.cjs');
const {createHandler}=require('../../server/handler.cjs');
const seed=()=>{const state=require('../../scripts/submitted-demo.cjs')();domain.engine(state,employees).runSchedulingAlgorithm();state.weekStatus=4;return state;};
const act=(state,action,payload,profile=profiles.manager)=>applyAction({state,employees},profile,action,payload,randomUUID());
function leave(state=seed()){const id=randomUUID();state.changeRequests.push({id,empId:'NV01',shiftId:'mon-after',targetShiftId:null,type:'Xin nghỉ đột xuất',reason:'Kiểm thử',status:'CHỜ DUYỆT',time:new Date().toISOString()});return {state,id};}
test('supplement submissions validate department, quota, duplicate and invalid selections atomically',()=>{
 const s=domain.emptyState(employees);s.weekStatus=3;s.shifts['mon-after'].assigned=['NV02'];
 const submit=(ids,person=profiles.employee)=>act(s,'submit',{shiftIds:ids},person);
 assert.throws(()=>submit(['mon-after']),e=>e.status===409&&/Bếp/.test(e.message));
 s.shifts['mon-after'].assigned.push('NV10');assert.throws(()=>submit(['mon-after']),{status:409});
 s.shifts['mon-after'].assigned=[];s.registrations.NV01.submittedShifts={'mon-after':1};assert.throws(()=>submit(['mon-after']),{status:409});
 for(const ids of [[],['bogus'],['constructor'],[null],['tue-eve','tue-eve']])assert.throws(()=>submit(ids),{status:400});
 assert.throws(()=>submit(['tue-eve','mon-morn']),{status:409});assert.equal(s.changeRequests.length,0);
 for(const p of [profiles.manager,profiles.admin])assert.throws(()=>submit(['tue-eve'],p),{status:403});
});
test('leave uses registered eligible replacement and never fabricates registrations',()=>{
 const {state,id}=leave(),original=structuredClone(state),o=act(state,'approve',{requestId:id});
 assert(o.state.shifts['mon-after'].assigned.includes('NV05'));assert(!o.state.shifts['mon-after'].assigned.includes('NV03'));assert.deepEqual(state,original);
 for(const sh of Object.values(o.state.shifts))assert(sh.registered.every(id=>state.shifts[sh.id].registered.includes(id)));
 assert.equal(o.result.reassignment.replacementId,'NV05');assert.match(o.result.message,/Đã duyệt đơn nghỉ/);
});
test('unregistered, busy, under-eligible and pending-leave candidates are not assigned',()=>{
 for(const mode of ['unregistered','busy','ineligible','pending']){
  const {state,id}=leave();
  if(mode==='unregistered')delete state.registrations.NV05.submittedShifts['mon-after'];
  if(mode==='busy')state.shifts['mon-eve'].assigned.push('NV05');
  if(mode==='ineligible')delete state.registrations.NV05.submittedShifts['wed-eve'];
  if(mode==='pending')state.changeRequests.push({id:randomUUID(),empId:'NV05',shiftId:'mon-after',status:'CHỜ DUYỆT'});
  const o=act(state,'approve',{requestId:id});assert.equal(o.result.reassignment.replacementId,null,mode);assert.match(o.result.message,/Thiếu/);assert(!o.result.message.includes('mở bổ sung'));assert.equal(o.state.weekStatus,4);
 }
});
function swap(){const state=domain.emptyState(employees);state.weekStatus=4;for(const key of ['mon-eve','tue-eve','wed-eve','thu-after'])state.shifts[key].registered=['NV01','NV02','NV03'];state.shifts['mon-eve'].assigned=['NV01'];state.shifts['tue-eve'].assigned=['NV03'];for(const id of ['NV01','NV02','NV03'])require('../../server/planning.cjs').submitDraft(state,id,1);const id=randomUUID();state.changeRequests=[{id,empId:'NV01',shiftId:'mon-eve',targetShiftId:'tue-eve',type:'Xin đổi ca',reason:'Test',status:'CHỜ DUYỆT',time:new Date().toISOString()}];return{state,id};}
test('swap requires registered destination, preserves eligible mutual swap and reports actual staffing',()=>{
 const {state,id}=swap();const o=act(state,'approve',{requestId:id});assert.deepEqual(o.state.shifts['mon-eve'].assigned,['NV03']);assert.deepEqual(o.state.shifts['tue-eve'].assigned,['NV01']);assert.equal(o.result.reassignment.mutualSwap,true);assert.match(o.result.message,/Thiếu/);assert(!o.result.message.includes('Cả 2 ca đều đủ'));
 delete state.registrations.NV01.submittedShifts['tue-eve'];assert.throws(()=>act(state,'approve',{requestId:id}),e=>e.status===409&&/chưa đăng ký/.test(e.message));
});
test('swap cannot move unregistered or busy partner and cannot exceed destination quota',()=>{
 const {state,id}=swap();state.shifts['tue-eve'].assigned=['NV02','NV03'];delete state.registrations.NV03.submittedShifts['mon-eve'];delete state.registrations.NV02.submittedShifts['mon-eve'];const before=structuredClone(state);
 assert.throws(()=>act(state,'approve',{requestId:id}),e=>e.status===409&&/giới hạn/.test(e.message));assert.deepEqual(state,before);
 state.registrations.NV03.submittedShifts['mon-eve']=1;state.shifts['mon-after'].assigned=['NV03'];assert.throws(()=>act(state,'approve',{requestId:id}),{status:409});
});
test('rejection preserves assignments, distinguishes outcome and cannot be reviewed twice',()=>{const {state,id}=leave(),o=act(state,'reject',{requestId:id});assert.match(o.result.message,/từ chối/);for(const key of Object.keys(state.shifts))assert.deepEqual(o.state.shifts[key].assigned,state.shifts[key].assigned);assert.throws(()=>act(o.state,'approve',{requestId:id}),{status:409});});
test('a mutual-swap candidate with a pending request is not moved out from under that request',()=>{
 const {state,id}=swap();state.changeRequests.push({id:randomUUID(),empId:'NV03',shiftId:'tue-eve',status:'CHỜ DUYỆT'});
 const o=act(state,'approve',{requestId:id});assert(o.state.shifts['tue-eve'].assigned.includes('NV03'));assert(!o.state.shifts['mon-eve'].assigned.includes('NV03'));assert.equal(o.result.reassignment.mutualSwap,false);
});
let db,backend,handler;const origin='http://localhost:4173';before(async()=>{db=await database();backend=new DatabaseBackend(db);handler=createHandler({backend,origin});});after(async()=>db?.close());
async function setup(state,week){await backend.commit({p_actor:profiles.manager.id,p_action:'demo_seed',p_expected_employee_id:null,p_request:randomUUID(),p_week:week,p_revision:0,p_fingerprint:randomUUID(),p_state:state,p_result:{message:'fixture'}});}
async function cookie(role){const r=await invoke(handler,{method:'POST',body:{action:'login',phone:profiles[role].phone,password:backend.loginPassword}});return r.headers['set-cookie'].split(';')[0];}
const post=(cookie,week,action,payload,revision=1,requestId=randomUUID())=>invoke(handler,{method:'POST',url:'/api/action',cookie,body:{week,revision,requestId,action,payload}});
// Force both operations to calculate from the same authoritative revision before either commits.
async function race(jobs){const original=backend.snapshot.bind(backend);let arrivals=0,release;const gate=new Promise(r=>release=r);backend.snapshot=async w=>{const s=await original(w);if(++arrivals===2)release();await gate;return s;};try{return await Promise.all(jobs.map(f=>f()));}finally{backend.snapshot=original;}}
test('competing supplements reserve nothing until review, and only one approval fits the last place',async()=>{
 const week='2026-12-07',s=domain.emptyState(employees);s.weekStatus=3;await setup(s,week);
 const a=await cookie('employee'),b=await cookie('other'),manager=await cookie('manager');
 const submitId=randomUUID();
 assert.equal((await post(a,week,'submit',{shiftIds:['mon-after']},1,submitId)).status,200);
 assert.equal((await post(a,week,'submit',{shiftIds:['mon-after']},1,submitId)).status,200);
 assert.equal((await post(a,week,'submit',{shiftIds:['mon-after']},2)).status,409);
 assert.equal((await post(b,week,'submit',{shiftIds:['mon-after']},2)).status,200);
 const pending=await backend.snapshot(week);assert.equal(pending.state.changeRequests.length,2);assert.deepEqual(pending.state.shifts['mon-after'].assigned,[]);
 const requests=pending.state.changeRequests;
 const results=await race(requests.map(r=>()=>post(manager,week,'approve',{requestId:r.id},3)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const loser=requests[results.findIndex(r=>r.status===409)];
 assert.equal((await post(manager,week,'approve',{requestId:loser.id},4)).status,409);
 assert.equal((await post(manager,week,'reject',{requestId:loser.id},4)).status,200);
 const saved=await backend.snapshot(week);assert.equal(saved.state.shifts['mon-after'].assigned.length,1);
 assert.deepEqual(saved.state.shifts['mon-after'].registered,saved.state.shifts['mon-after'].assigned);
 assert.equal(saved.state.changeRequests.find(r=>r.id===loser.id).status,'TỪ CHỐI');
});
test('withdraw is owner-only, persists without a manager decision, and cannot race past approval',async()=>{
 const week='2027-02-01',state=domain.emptyState(employees);state.weekStatus=3;await setup(state,week);
 const employee=await cookie('employee'),manager=await cookie('manager'),other=await cookie('other');
 assert.equal((await post(employee,week,'submit',{shiftIds:['mon-eve','tue-after']})).status,200);
 const [first,second]=(await backend.snapshot(week)).state.changeRequests;
 assert.equal((await post(other,week,'withdraw',{requestId:first.id},2)).status,404);
 assert.equal((await post(employee,week,'withdraw',{requestId:first.id},2)).status,200);
 assert.equal((await post(manager,week,'approve',{requestId:first.id},3)).status,409);
 assert.equal((await db.query('select * from approval_history where request_id=$1',[first.id])).rows.length,0);
 const result=await race([()=>post(employee,week,'withdraw',{requestId:second.id},3),()=>post(manager,week,'approve',{requestId:second.id},3)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 const saved=(await backend.snapshot(week)).state;
 assert.equal(saved.changeRequests.find(r=>r.id===first.id).status,'ĐÃ RÚT');
 assert.equal(saved.shifts[second.shiftId].assigned.includes('NV01'),result[1].status===200);
});
test('concurrent approve/reject: exactly one decision and history; successful retry is idempotent',async()=>{
 const week='2026-12-14',{state,id}=leave();await setup(state,week);const c=await cookie('manager'),op=randomUUID();
 const results=await race([()=>post(c,week,'approve',{requestId:id},1,op),()=>post(c,week,'reject',{requestId:id})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const saved=await backend.snapshot(week);
 const rows=(await db.query('select * from approval_history where request_id=$1',[id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].result,saved.state.changeRequests[0].status);
 if(results[0].status===200)assert.deepEqual((await post(c,week,'approve',{requestId:id},1,op)).data,results[0].data);
 assert.equal((await post(c,week,'approve',{requestId:id},2)).status,409);
});
test('failed database approval emits no success and rolls back assignment, request and audit history',async()=>{
 const week='2026-12-21',{state,id}=leave();await setup(state,week);const c=await cookie('manager');
 await db.exec("create function public.test_fail_approval() returns trigger language plpgsql as $$ begin raise exception 'simulated storage failure'; end $$; create trigger test_fail before insert on approval_history for each row execute function public.test_fail_approval();");
 try{const r=await post(c,week,'approve',{requestId:id});assert.equal(r.status,500);assert.equal(r.data.message,undefined);const saved=await backend.snapshot(week);assert.equal(saved.revision,1);assert.equal(saved.state.changeRequests[0].status,'CHỜ DUYỆT');assert.deepEqual(saved.state.shifts['mon-after'].assigned,state.shifts['mon-after'].assigned);assert.equal((await db.query('select count(*)::int n from approval_history where request_id=$1',[id])).rows[0].n,0);}finally{await db.exec('drop trigger test_fail on approval_history; drop function public.test_fail_approval();');}
});
test('two approvals competing for the same registered replacement cannot both commit stale plans',async()=>{
 const week='2026-12-28',{state,id}=leave();state.shifts['mon-eve'].assigned.push('NV01');state.shifts['mon-eve'].registered.push('NV01','NV05');for(const id of ['NV01','NV05'])state.registrations[id].submittedShifts['mon-eve']=1;
 const second=randomUUID();state.changeRequests.push({id:second,empId:'NV01',shiftId:'mon-eve',targetShiftId:null,type:'Xin nghỉ đột xuất',reason:'Test',status:'CHỜ DUYỆT',time:new Date().toISOString()});await setup(state,week);const c=await cookie('manager');
 const results=await race([()=>post(c,week,'approve',{requestId:id}),()=>post(c,week,'approve',{requestId:second})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const loser=results[0].status===409?id:second;const retry=await post(c,week,'approve',{requestId:loser},2);assert.equal(retry.status,200);
 const saved=await backend.snapshot(week);assert.equal(Object.values(saved.state.shifts).filter(s=>s.dayKey==='mon'&&s.assigned.includes('NV05')).length,1);assert.equal((await db.query('select count(*)::int n from approval_history where request_id in ($1,$2)',[id,second])).rows[0].n,2);
});
