'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const original=require('../../proposals/scheduling-registration-hours/load-proposal.cjs').loadHistoricalOriginal(),employees=require('../../server/employees.cjs'),seed=require('../../scripts/demo-data.json');
const proposal=require('../../proposals/scheduling-registration-hours/load-proposal.cjs').loadProposal();
const assign=s=>Object.fromEntries(Object.entries(s.shifts).map(([id,shift])=>[id,[...shift.assigned]]));
const run=(domain,phase,input=seed)=>{const state=structuredClone(input);state.weekStatus=phase;domain.engine(state,employees).runSchedulingAlgorithm();return state;};
test('independent reproduction: 73 registrations, phase 2 zero/18 excluded, phase 1 65/zero excluded',()=>{
 assert.equal(Object.values(seed.shifts).reduce((n,s)=>n+s.registered.length,0),73);
 const two=run(original,2),one=run(original,1);
 assert.equal(Object.values(two.shifts).reduce((n,s)=>n+s.assigned.length,0),0);
 assert.equal(Object.values(two.registrations).filter(r=>r.isDisqualified).length,18);
 assert.equal(Object.values(one.shifts).reduce((n,s)=>n+s.assigned.length,0),65);
});
test('approved main produces exactly the historical phase-1 allocation, including priorities and tie ordering, for all phases',()=>{
 const expected=assign(run(original,1));for(const phase of[1,2,3,4])assert.deepEqual(assign(run(proposal,phase)),expected);
});
test('approved eligibility uses registered 20-hour and two-evening boundaries, not stale assignments',()=>{
 const exact=run(proposal,2);assert.equal(proposal.engine(exact,employees).getEmployeeStats('NV10').regHours,20);assert.equal(exact.registrations.NV10.isDisqualified,false);
 for(const scenario of ['hours','evenings']){
   const input=structuredClone(seed);
   for(const shift of Object.values(input.shifts)){shift.registered=shift.registered.filter(id=>id!=='NV01');shift.assigned=['NV01'];}
   for(const id of scenario==='hours'?['mon-eve','tue-eve','wed-eve']:['mon-morn','tue-morn','wed-morn','thu-morn','fri-morn','sat-eve']){
     // Use kitchen-compatible afternoon shifts for the high-hours, one-evening case.
     const key=id.endsWith('morn')?id.replace('morn','after'):id;input.shifts[key].registered.push('NV01');
   }
   const result=run(proposal,2,input);assert.equal(result.registrations.NV01.isDisqualified,true);assert(Object.values(result.shifts).every(s=>!s.assigned.includes('NV01')));
 }
});
test('all corrected assignments are registered, unique, skilled, within department quotas and drawn from eligible employees',()=>{
 const state=run(proposal,2),rules=proposal.engine(state,employees);
 for(const shift of Object.values(state.shifts)){
  assert.equal(new Set(shift.assigned).size,shift.assigned.length);
  const conf=proposal.SHIFT_CONFIGS.find(c=>c.key===shift.shiftKey);
  for(const id of shift.assigned){const emp=employees.find(e=>e.id===id),stats=rules.getEmployeeStats(id);assert(shift.registered.includes(id));assert(rules.isDeptAllowed(emp.dept,shift.shiftKey));assert(stats.regHours>=20&&stats.regEvening>=2);}
  for(const dept of ['Bếp','Phục vụ','Pha chế']){const count=shift.assigned.filter(id=>employees.find(e=>e.id===id).dept===dept).length;assert(count<=(conf.quotas[dept]?.max||0));}
 }
});
test('repeated corrected scheduling is deterministic and does not change registrations or UI statistics semantics',()=>{
 const state=run(proposal,2),first=assign(state),registrations=Object.fromEntries(Object.entries(state.shifts).map(([id,s])=>[id,[...s.registered]]));
 proposal.engine(state,employees).runSchedulingAlgorithm();assert.deepEqual(assign(state),first);
 assert.deepEqual(Object.fromEntries(Object.entries(state.shifts).map(([id,s])=>[id,[...s.registered]])),registrations);
 const stats=proposal.engine(state,employees).getEmployeeStats('NV01');assert.equal(stats.totalHours,stats.assignedHours);
});
test('UI, demo data and migrations stay unchanged; domain differs by exactly the approved condition',()=>{
 const root=path.resolve(__dirname,'../..'),baseline={...require('../../docs/audit/unchanged-baseline.json'),...require('../legacy/presentation-baseline.json')};
 for(const [file,hash]of Object.entries(baseline)){const bytes=fs.readFileSync(path.join(root,file));const checked=file==='shared/domain.js'?require('../../proposals/scheduling-registration-hours/load-proposal.cjs').historicalSource(bytes.toString('utf8')):bytes;assert.equal(crypto.createHash('sha256').update(checked).digest('hex'),hash,file);}
});
test('approved fix does not conceal the original greedy algorithm final-allocation shortfalls',()=>{
 const baseline=run(original,1),proposed=run(proposal,2);
 const shortfall=(d,state)=>employees.filter(e=>{const s=d.engine(state,employees).getEmployeeStats(e.id);return s.assignedHours<20||s.assignedEvening<2;}).map(e=>e.id);
 assert.deepEqual(shortfall(proposal,proposed),shortfall(original,baseline));assert.equal(shortfall(proposal,proposed).length,7);
});
