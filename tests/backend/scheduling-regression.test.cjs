'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const domain=require('../../shared/domain.js'),employees=require('../../server/employees.cjs'),demo=require('../../scripts/demo-data.json');
const {loadHistoricalOriginal}=require('../../proposals/scheduling-registration-hours/load-proposal.cjs');
const {applyAction}=require('../../server/workflows.cjs');
const {profiles}=require('./helpers.cjs');
function run(engine,phase,state=structuredClone(demo)){state.weekStatus=phase;engine.engine(state,employees).runSchedulingAlgorithm();return state;}
const allocation=state=>Object.fromEntries(Object.entries(state.shifts).map(([id,s])=>[id,[...s.assigned]]));
const count=state=>Object.values(state.shifts).reduce((n,s)=>n+s.assigned.length,0);
test('approved regression: 73 registrations produce 65 assignments and zero disqualifications at step 2',()=>{
 const historical=loadHistoricalOriginal(),before=run(historical,2),after=run(domain,2);
 assert.equal(Object.values(demo.shifts).reduce((n,s)=>n+s.registered.length,0),73);
 assert.equal(count(before),0);assert.equal(Object.values(before.registrations).filter(r=>r.isDisqualified).length,18);
 assert.equal(count(after),65);assert.equal(Object.values(after.registrations).filter(r=>r.isDisqualified).length,0);
 assert.deepEqual(allocation(after),allocation(run(historical,1)));
});
test('corrected results are deterministic across identical clones, valid engine phases and reruns',()=>{
 const expected=allocation(run(domain,2));
 for(const phase of[1,2,3])for(let repeat=0;repeat<3;repeat++)assert.deepEqual(allocation(run(domain,phase)),expected);
 const state=run(domain,2),registrations=Object.fromEntries(Object.entries(state.shifts).map(([id,s])=>[id,[...s.registered]]));
 for(let repeat=0;repeat<3;repeat++){domain.engine(state,employees).runSchedulingAlgorithm();assert.deepEqual(allocation(state),expected);}
 assert.deepEqual(Object.fromEntries(Object.entries(state.shifts).map(([id,s])=>[id,[...s.registered]])),registrations);
});
test('manager scheduling at step 2 uses the corrected engine without changing workflow guards',()=>{
 const snapshot={state:require('../../scripts/submitted-demo.cjs')(),employees,revision:0};snapshot.state.weekStatus=2;
 const result=applyAction(snapshot,profiles.manager,'generate',{},randomUUID());
 assert.equal(count(result.state),65);assert.equal(result.state.weekStatus,3);
 assert.equal(result.result.details.fromPhase,2);
 const published=structuredClone(snapshot);published.state.weekStatus=4;
 assert.throws(()=>applyAction(published,profiles.manager,'generate',{},randomUUID()),e=>e.status===409);
});
