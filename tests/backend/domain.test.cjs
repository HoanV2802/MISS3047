const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {applyAction,visibleWorkspace}=require('../../server/workflows.cjs');const {phone,week}=require('../../server/validation.cjs');
const {domain,employees,profiles}=require('./helpers.cjs');
const seed=()=>({state:structuredClone(require('../../scripts/demo-data.json')),employees,revision:0});
const apply=(snapshot,role,action,payload={})=>applyAction(snapshot,profiles[role],action,payload,randomUUID());
test('phone normalization and invalid inputs',()=>{assert.equal(phone('0900 000 003'),'+84900000003');assert.equal(phone('0084900000003'),'+84900000003');assert.throws(()=>phone('NV01'));assert.throws(()=>week('2026-02-30'));assert.throws(()=>week('2026-10-27'));});
test('phase-2 scheduling uses registered eligibility and produces 65 demo assignments',()=>{const x=seed();domain.engine(x.state,employees).runSchedulingAlgorithm();assert.equal(Object.values(x.state.shifts).reduce((n,s)=>n+s.assigned.length,0),65);assert.equal(Object.values(x.state.registrations).filter(r=>r.isDisqualified).length,0);});
test('phase-1 algorithm preserves registered staff and department quotas',()=>{const x=seed();x.state.weekStatus=1;const result=apply(x,'manager','generate');assert.equal(result.state.weekStatus,3);assert(Object.values(result.state.shifts).some(s=>s.assigned.length>0));for(const s of Object.values(result.state.shifts))for(const id of s.assigned)assert(domain.engine(result.state,employees).isDeptAllowed(employees.find(e=>e.id===id).dept,s.shiftKey));});
test('employees/admin cannot schedule, approve or change workflow',()=>{for(const role of ['employee','admin'])for(const action of ['generate','phase','approve','reject'])assert.throws(()=>apply(seed(),role,action,{status:1}),e=>e.status===400||e.status===403);});
test('registration enforces ownership, duplicate, department and phase boundaries',()=>{const x=seed();x.state.weekStatus=1;assert.throws(()=>apply(x,'employee','registration',{shiftId:'mon-after',selected:true}),e=>e.status===409);assert.throws(()=>apply(x,'employee','registration',{shiftId:'mon-morn',selected:true}),e=>e.status===403);assert.throws(()=>apply(x,'employee','registration',{shiftId:'wed-after',selected:true,empId:'NV02'}),e=>e.status===400);const result=apply(x,'employee','registration',{shiftId:'wed-after',selected:true});assert(result.state.shifts['wed-after'].registered.includes('NV01'));assert(!x.state.shifts['wed-after'].registered.includes('NV01'));x.state.weekStatus=2;assert.throws(()=>apply(x,'employee','registration',{shiftId:'wed-after',selected:true}),e=>e.status===409);});
test('submission validates 20 hours and two evenings, and closed windows',()=>{const x=seed();x.state.weekStatus=1;assert(apply(x,'employee','submit').state.registrations.NV01.isSubmitted);for(const s of Object.values(x.state.shifts))s.registered=[];assert.throws(()=>apply(x,'employee','submit'),e=>e.status===422);x.state.weekStatus=4;assert.throws(()=>apply(x,'employee','submit'),e=>e.status===409);});
test('publication requires explicit acknowledgement; invalid workflow states fail',()=>{assert.throws(()=>apply(seed(),'manager','phase',{status:4}),e=>e.code==='CONFIRM_MISSING');assert.equal(apply(seed(),'manager','phase',{status:4,acceptMissing:true}).state.weekStatus,4);for(const status of [0,5,'1',null])assert.throws(()=>apply(seed(),'manager','phase',{status}),e=>e.status===400);});
test('supplementary registration and closed/full shifts',()=>{const x=seed();x.state.weekStatus=3;const result=apply(x,'employee','registration',{shiftId:'wed-after',selected:true});assert(result.state.shifts['wed-after'].assigned.includes('NV01'));x.state.shifts['wed-after'].assigned=['NV02','NV10'];assert.throws(()=>apply(x,'employee','registration',{shiftId:'wed-after',selected:true}),e=>e.status===409);});
test('request ownership, duplicates, required reason, target validation and approval/rejection',()=>{
  let x=seed();x.state.weekStatus=1;domain.engine(x.state,employees).runSchedulingAlgorithm();x.state.weekStatus=4;
  const id=Object.values(x.state.shifts).find(s=>s.assigned.includes('NV01')).id;
  assert.throws(()=>apply(x,'other','request',{shiftId:id,type:'leave',reason:'Test'}),e=>e.status===403);
  assert.throws(()=>apply(x,'employee','request',{shiftId:id,type:'leave',reason:' '}),e=>e.status===400);
  assert.throws(()=>apply(x,'employee','request',{shiftId:id,type:'swap',reason:'Test',targetShiftId:'mon-morn'}),e=>e.status===422);
  const created=apply(x,'employee','request',{shiftId:id,type:'leave',targetShiftId:null,reason:'Bận lịch thi'});x.state=created.state;
  assert.throws(()=>apply(x,'employee','request',{shiftId:id,type:'leave',reason:'Trùng'}),e=>e.status===409);
  const requestId=x.state.changeRequests[0].id;
  assert.equal(apply(x,'manager','reject',{requestId}).state.changeRequests[0].status,'TỪ CHỐI');
  const approved=apply(x,'manager','approve',{requestId});assert.equal(approved.state.changeRequests[0].status,'ĐÃ DUYỆT');assert(!approved.state.shifts[id].assigned.includes('NV01'));
  assert.throws(()=>apply({...x,state:approved.state},'manager','approve',{requestId}),e=>e.status===409);
});
test('employee responses do not expose other employees, registrations or reasons',()=>{const x=seed();const visible=visibleWorkspace(x,profiles.employee);assert.deepEqual(visible.employees.map(e=>e.id),['NV01']);assert.deepEqual(Object.keys(visible.state.registrations),['NV01']);for(const s of Object.values(visible.state.shifts))assert(s.registered.every(id=>id==='NV01'));assert.throws(()=>visibleWorkspace(x,profiles.admin),e=>e.status===403);});
test('only the approved eligibility condition differs from the audited algorithm; other rules remain unchanged',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const baseline=require('../legacy/business-baseline.json'),contract=require('../legacy/original-contract.json');
 const source=fs.readFileSync(path.join(__dirname,'../../shared/domain.js'),'utf8');
 for(const name of ['getEmployeeStats','isDeptAllowed','evaluateShiftStaffing','runSchedulingAlgorithm','approveChangeRequest','rejectChangeRequest']){
   let code=source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`,'m'))[0];
   if(name==='runSchedulingAlgorithm'){assert.equal(code.split('if (stats.regHours < 20 || stats.regEvening < 2)').length,2);code=code.replace('if (stats.regHours < 20 || stats.regEvening < 2)','if (!stats.isValid)');}
   assert.equal(crypto.createHash('sha256').update(code).digest('hex'),baseline[name],name);
 }
 for(const name of ['DAYS','SHIFT_CONFIGS']){const code=source.match(new RegExp(`^const ${name} = [\\s\\S]*?^\\];`,'m'))[0];assert.equal(crypto.createHash('sha256').update(code).digest('hex'),contract[name]);}
});

test('missing or prototype-named shift input is rejected as invalid input',()=>{const x=seed();x.state.weekStatus=1;for(const shiftId of [undefined,'constructor','toString',null])assert.throws(()=>apply(x,'employee','registration',{shiftId,selected:true}),e=>e.status===400);});

test('audit outcomes identify publication, acceptance and approval target without logging reasons',()=>{const published=apply(seed(),'manager','phase',{status:4,acceptMissing:true});assert.deepEqual(published.result.details,{fromPhase:2,toPhase:4,status:4,acceptMissing:true});assert(!Object.hasOwn(published.result.details,'reason'));});
