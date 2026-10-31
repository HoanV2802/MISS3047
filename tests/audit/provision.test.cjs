'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {validateManifest,credentialWriter}=require('../../scripts/provision-lib.cjs');
const {provision}=require('../../scripts/provision.cjs');
const employees=require('../../server/employees.cjs');
const root=path.resolve(__dirname,'../..');
const records=()=>[{role:'admin',phone:'+84910000001'},{role:'manager',phone:'+84910000002'},...employees.map((e,i)=>({role:'employee',employeeId:e.id,phone:`+8491${String(i+3).padStart(7,'0')}`}))];
async function temp(action){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'2ce-audit-provision-'));try{return await action(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
function mock({failProfileAt=0,existingWeek=false}={}){
 const profiles=[],users=[],created=[],commits=[];let requests=0;
 const backend={async accounts(){return structuredClone(profiles);},async snapshot(){return{exists:existingWeek};},async request(route,options){
  if(route.startsWith('/auth/v1/admin/users?'))return{users:structuredClone(users)};
  if(route==='/auth/v1/admin/users'){const user={id:randomUUID(),phone:options.body.phone};users.push(user);created.push(options.body);return user;}
  if(route==='/rest/v1/profiles'){profiles.push(options.body);return null;}
  if(route==='/rest/v1/audit_logs')return null;
  throw new Error('Unexpected '+route);
 },async rpc(name,p){assert.equal(name,'manage_profile');if(++requests===failProfileAt)throw new Error('Injected profile persistence failure');profiles.push({id:p.p_target,phone:p.p_phone,display_name:p.p_name,role:p.p_role,employee_id:p.p_employee,active:p.p_active});},async commit(value){commits.push(value);}};
 return{backend,profiles,users,created,commits};
}
test('provision preflight validates roles, phone uniqueness and personnel mapping before network calls',()=>{
 assert.equal(validateManifest(records()).length,20);
 for(const mutate of [x=>x[0].employeeId='NV01',x=>x[2].employeeId='NV99',x=>x[1].phone=x[0].phone,x=>x[0].password='must-not-be-in-manifest']){const bad=records();mutate(bad);assert.throws(()=>validateManifest(bad));}
});
test('credential replacement failure preserves the previous complete private file',()=>temp(async dir=>{
 const output=path.join(dir,'private.json');let failRename=false;
 const io={...fs,async rename(a,b){if(failRename)throw new Error('Injected disk failure');return fs.rename(a,b);}};
 const writer=await credentialWriter(output,{root,io});await writer.save([{phone:'fixture-one',password:'generated-test-only'}]);failRename=true;
 await assert.rejects(writer.save([{phone:'fixture-one'},{phone:'fixture-two'}]));
 assert.equal(JSON.parse(await fs.readFile(output,'utf8')).length,1);assert.equal((await fs.stat(output)).mode&0o777,0o600);
 await assert.rejects(credentialWriter(output,{root}),{code:'EEXIST'});
}));
test('credential output rejects a symlinked path into the repository',()=>temp(async dir=>{
 await fs.symlink(root,path.join(dir,'repo-link'));
 await assert.rejects(credentialWriter(path.join(dir,'repo-link','must-not-exist.json'),{root}),/outside the repository/);
}));
test('provisioning creates 20 correctly mapped identities, seeds the corrected phase-2 demo schedule, and never resets an existing password',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock();
 const output=path.join(dir,'credentials.json');const result=await provision({manifest,output,bootstrap:true,seedWeek:'2026-10-26',backend:fake.backend});
 assert.equal(result.created,20);assert.equal(fake.profiles.length,20);assert(fake.created.every(r=>r.phone_confirm===true&&r.password.length>=32));
 for(const employee of employees){const profile=fake.profiles.find(p=>p.employee_id===employee.id);assert.equal(profile.display_name,employee.name);}
 const stored=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(stored.length,20);assert.equal(new Set(stored.map(x=>x.password)).size,20);
 const seeded=fake.commits[0].p_state;assert.equal(Object.values(seeded.shifts).reduce((n,s)=>n+s.registered.length,0),73);assert.equal(Object.values(seeded.shifts).reduce((n,s)=>n+s.assigned.length,0),65);assert.equal(Object.values(seeded.registrations).filter(r=>r.isDisqualified).length,0);
 assert.equal((await provision({manifest,output:path.join(dir,'second.json'),backend:fake.backend})).created,0);assert.equal(fake.created.length,20);
}));
test('a partial profile failure leaves recoverable credentials, no success result and no automatic deletion/reset',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'partial.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock({failProfileAt:1});
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/Injected profile/);
 const recovered=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(recovered.length,2);assert.equal(fake.users.length,2);assert.equal(fake.profiles.length,1);
 await assert.rejects(provision({manifest,output:path.join(dir,'retry.json'),backend:fake.backend}),/without matching profile/);assert.equal(fake.created.length,2);await assert.rejects(fs.access(path.join(dir,'retry.json')),{code:'ENOENT'});
}));
test('existing seed week and inactive/mismatched identities fail before creating accounts or output',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'never.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock({existingWeek:true});
 await assert.rejects(provision({manifest,output,bootstrap:true,seedWeek:'2026-10-26',backend:fake.backend}),/Week already exists/);assert.equal(fake.created.length,0);await assert.rejects(fs.access(output),{code:'ENOENT'});
 fake.profiles.push({id:randomUUID(),phone:records()[0].phone,role:'admin',employee_id:null,active:false});
 await assert.rejects(provision({manifest,output,backend:fake.backend}),/No active administrator/);
 fake.profiles[0].active=true;fake.users.push({id:randomUUID(),phone:records()[0].phone});
 await assert.rejects(provision({manifest,output,backend:fake.backend}),/identity does not match/);assert.equal(fake.created.length,0);await assert.rejects(fs.access(output),{code:'ENOENT'});
}));
