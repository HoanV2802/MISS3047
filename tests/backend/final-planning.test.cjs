'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {database,DatabaseBackend,profiles,employees,domain}=require('./helpers.cjs');
const {applyAction}=require('../../server/workflows.cjs');
const {generate,submitDraft}=require('../../server/planning.cjs');
const fixture=()=>domain.emptyState(employees);
const apply=(state,role,action,payload={})=>applyAction({state,employees},profiles[role],action,payload,randomUUID());

test('reserve approved supplemental assignments even below target; conflicting fixed quotas stop the operation',()=>{
  let state=fixture();state.weekStatus=3;
  state=apply(state,'employee','submit',{shiftIds:['mon-after']}).state;
  const req=state.changeRequests[0].id;
  state=apply(state,'manager','approve',{requestId:req}).state;
  const rerun=apply(state,'manager','generate').state;
  assert.deepEqual(rerun.shifts['mon-after'].assigned,['NV01']);
  assert.equal(rerun.registrations.NV01.protectedShifts['mon-after'],req);
  assert.equal(rerun.weekStatus,3);
  const bad=structuredClone(rerun);
  bad.registrations.NV02.protectedShifts={'mon-after':randomUUID()};
  bad.registrations.NV02.submittedShifts={'mon-after':10};
  bad.shifts['mon-after'].assigned.push('NV02');
  assert.throws(()=>apply(bad,'manager','generate'),e=>e.status===409 && /Xung đột/.test(e.message));
  assert.deepEqual(bad.shifts['mon-after'].assigned,['NV01','NV02']);
  rerun.weekStatus=4;
  const leave=apply(rerun,'employee','request',{type:'leave',shiftId:'mon-after',reason:'Bận',targetShiftId:null}).state;
  const released=apply(leave,'manager','approve',{requestId:leave.changeRequests[0].id});
  assert.equal(released.result.reassignment.releasedProtection,req);
  assert(!released.state.registrations.NV01.protectedShifts['mon-after']);
});

test('after both candidates reach 20h, first submission for this slot wins even with more hours; identical timestamps use ID',()=>{
  const state=fixture();
  const sets={NV01:['mon-after','mon-eve','tue-eve','wed-eve','sun-after'],NV02:['tue-after','mon-eve','tue-eve','wed-after','sun-after']};
  for(const [id,keys] of Object.entries(sets))for(const key of keys) state.shifts[key].registered.push(id);
  submitDraft(state,'NV01',10);submitDraft(state,'NV02',20);
  const run=(s,staff)=>{generate(s,staff);return Object.fromEntries(Object.entries(s.shifts).map(([k,v])=>[k,v.assigned]));};
  const normal=run(structuredClone(state),employees);
  assert.deepEqual(normal['sun-after'],['NV01']); // 22h vs 20h
  for(const shift of Object.values(state.shifts))shift.registered.reverse();
  assert.deepEqual(run(structuredClone(state),employees.slice().reverse()),normal);
  state.registrations.NV01.submittedShifts['sun-after']=30;
  assert.deepEqual(run(structuredClone(state),employees)['sun-after'],['NV02']);
  state.registrations.NV01.submittedShifts['sun-after']=20;
  assert.deepEqual(run(state,employees.slice().reverse())['sun-after'],['NV01']);
});

test('database retains last valid form, per-slot submission time and previous week across draft edits, resubmission and regeneration',async()=>{
  const db=await database(), backend=new DatabaseBackend(db);
  try {
    const week='2030-01-07',later='2030-01-14';
    async function write(role,action,payload,w=week){
      const snapshot=await backend.snapshot(w), actor=profiles[role],id=randomUUID();
      const {state,result}=applyAction(snapshot,actor,action,payload,id,new Date(0));
      await backend.commit({p_actor:actor.id,p_expected_employee_id:actor.employee_id,p_action:action,p_request:id,p_week:w,p_revision:snapshot.revision,p_fingerprint:id,p_state:state,p_result:result});
      return (await backend.snapshot(w)).state;
    }
    await write('manager','phase',{status:1});
    const select=(shiftId,selected=true)=>write('employee','registration',{shiftId,selected});
    for(const key of ['mon-after','tue-after','thu-eve','fri-eve'])await select(key);
    let state=await write('manager','generate',{});
    assert.deepEqual(state.shifts['mon-after'].assigned,[]);
    await write('manager','phase',{status:1});
    state=await write('employee','submit',{});
    const first=state.registrations.NV01.submittedShifts['mon-after'];
    assert(first>0); // PostgreSQL acceptance time, not the injected application clock.
    await select('mon-after',false);
    await assert.rejects(write('employee','submit',{}),{status:422});
    state=await write('manager','generate',{});
    assert.equal(state.registrations.NV01.isSubmitted,false);
    assert.deepEqual(state.shifts['mon-after'].assigned,['NV01']);
    await write('manager','phase',{status:1});await select('mon-after');await select('wed-after');
    state=await write('employee','submit',{});
    assert.equal(state.registrations.NV01.submittedShifts['mon-after'],first);
    assert(state.registrations.NV01.submittedShifts['wed-after']>=first);
    assert.equal(Object.keys(state.registrations.NV01.submittedShifts).length,5);
    await write('manager','generate',{});
    const saved=await backend.snapshot(week);
    await write('manager','generate',{},later);
    assert.deepEqual(await backend.snapshot(week),saved);
  } finally {await db.close();}
});

test('upgrading populated weeks preserves old assignments/history, recovers approved locks and flags ambiguous drafts',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const db=await database(undefined,'202611010002_workspace_actor_binding.sql'),backend=new DatabaseBackend(db);
  try {
    const week='2031-01-06', state=fixture(), req=randomUUID();
    state.weekStatus=3;state.shifts['mon-after'].registered=['NV01'];state.shifts['mon-after'].assigned=['NV01'];
    state.registrations.NV01.isSubmitted=true;
    state.changeRequests=[{id:req,empId:'NV01',shiftId:'mon-after',targetShiftId:null,type:'Đăng ký bổ sung',
      status:'ĐÃ DUYỆT',time:new Date().toISOString(),reason:'fixture'}];
    await backend.commit({p_actor:profiles.manager.id,p_expected_employee_id:null,p_action:'demo_seed',p_week:week,
      p_revision:0,p_request:randomUUID(),p_fingerprint:'upgrade',p_state:state,p_result:{}});
    const before=await backend.snapshot(week);
    await db.exec(await fs.readFile(path.join(__dirname,'../../supabase/migrations/202611010003_submitted_plans.sql'),'utf8'));
    const after=await backend.snapshot(week);
    assert.equal(after.revision,before.revision);assert.deepEqual(after.state.shifts,before.state.shifts);
    assert.deepEqual(after.state.changeRequests,before.state.changeRequests);
    assert.equal(after.state.registrations.NV01.protectedShifts['mon-after'],req);
    assert.equal(after.state.registrations.NV01.needsConfirmation,true);
    assert.throws(()=>apply(after.state,'manager','generate'),e=>e.status===409 && /xác nhận/.test(e.message));
    // Even a stale trusted backend cannot erase a fixed seat by passing a new plan.
    after.state.shifts['mon-after'].assigned=[];
    await assert.rejects(backend.commit({p_actor:profiles.manager.id,p_expected_employee_id:null,p_action:'generate',p_week:week,
      p_revision:after.revision,p_request:randomUUID(),p_fingerprint:'erase',p_state:after.state,p_result:{}}),{code:'23514'});
    assert.deepEqual((await backend.snapshot(week)).state.shifts['mon-after'].assigned,['NV01']);
  } finally {await db.close();}
});
