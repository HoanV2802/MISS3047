'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {validateManifest,credentialWriter}=require('../../scripts/provision-lib.cjs');
const {provision}=require('../../scripts/provision.cjs');
const employees=require('../../server/employees.cjs');
const root=path.resolve(__dirname,'../..');
const records=()=>[{role:'admin',phone:'+84910000001'},{role:'manager',phone:'+84910000002'},...employees.map((e,i)=>({role:'employee',employeeId:e.id,phone:`+8491${String(i+3).padStart(7,'0')}`}))];
async function temp(action){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'2ce-audit-provision-'));try{return await action(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
function mock({failProfileAt=0,existingWeek=false}={}){
 const profiles=[],users=[],created=[],commits=[],audits=[];let requests=0;
 const backend={async accounts(){return structuredClone(profiles);},async snapshot(){return{exists:existingWeek};},async request(route,options){
  if(route==='/rest/v1/employees?select=id&order=id.asc')return employees.map(e=>({id:e.id}));
  if(route.startsWith('/rest/v1/audit_logs?'))return structuredClone(audits);
  if(route.startsWith('/auth/v1/admin/users?'))return{users:structuredClone(users)};
  if(route==='/auth/v1/admin/users'){const user={id:randomUUID(),phone:options.body.phone,phone_confirmed_at:new Date().toISOString()};users.push(user);created.push(options.body);return user;}
  if(route==='/rest/v1/profiles'){profiles.push(options.body);return null;}
  if(route==='/rest/v1/audit_logs'){audits.push(options.body);return null;}
  throw new Error('Unexpected '+route);
 },async rpc(name,p){assert.equal(name,'manage_profile');if(++requests===failProfileAt)throw new Error('Injected profile persistence failure');profiles.push({id:p.p_target,phone:p.p_phone,display_name:p.p_name,role:p.p_role,employee_id:p.p_employee,active:p.p_active});},async commit(value){commits.push(value);}};
 return{backend,profiles,users,created,commits,audits};
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

test('staging manifest has exactly the seeded employee IDs, roles and normalized unique phones',async()=>{
 const manifest=require('../../scripts/accounts.staging.json'),normalized=validateManifest(manifest);
 assert.deepEqual(normalized.reduce((counts,r)=>(counts[r.role]++,counts),{admin:0,manager:0,employee:0}),{admin:1,manager:1,employee:18});
 const sql=await fs.readFile(path.join(root,'supabase/migrations/202610310002_employees.sql'),'utf8');
 const seeded=[...sql.matchAll(/^\('(NV\d{2})',/gm)].map(m=>m[1]);
 assert.deepEqual(normalized.filter(r=>r.role==='employee').map(r=>r.employeeId).sort(),employees.map(e=>e.id).sort());
 assert.deepEqual(seeded.sort(),employees.map(e=>e.id).sort());assert.equal(new Set(normalized.map(r=>r.phone)).size,20);
 for(const mutate of [x=>x.pop(),x=>x.push(x[0]),x=>x[1].role='admin',x=>x[3].employeeId=x[2].employeeId,x=>x[0].employeeId=false,x=>x[0].displayName=42,x=>x[0].displayName='',x=>x[2]=null,x=>x[1].phone='0044 7700 900100']){
  const invalid=structuredClone(manifest);mutate(invalid);assert.throws(()=>validateManifest(invalid));
 }
});

// Real temporary files with injected I/O errors; never use credentials or .env.
function instrumentIO(fault){
 const handles=[];
 const io={...fs,async open(file,flags,mode){
  if(fault==='open-temp'&&file.endsWith('.tmp'))throw Object.assign(new Error('Injected exclusive-open collision'),{code:'EEXIST'});
  const real=await fs.open(file,flags,mode),entry={file,flags,closed:false,closes:0};handles.push(entry);
  return{
   async writeFile(value){if(fault==='write'&&file.endsWith('.tmp')){await real.writeFile('{');throw new Error('Injected write failure');}if(fault==='reserve'&&flags==='wx'&&!file.endsWith('.tmp')){await real.writeFile('[');throw new Error('Injected reserve failure');}return real.writeFile(value);},
   async sync(){if((fault==='sync'&&file.endsWith('.tmp'))||(fault==='directory-sync'&&flags==='r'))throw new Error('Injected sync failure');return real.sync();},
   async close(){entry.closes++;if(!entry.closed){await real.close();entry.closed=true;}if(fault==='close'&&file.endsWith('.tmp'))throw new Error('Injected close failure');}
  };
 },async rm(file,options){if(fault==='open-temp'&&file.endsWith('.tmp'))throw new Error('Must not remove a file this writer did not create');return fs.rm(file,options);}};
 return{io,handles};
}
test('credential writer awaits file closure, replaces complete JSON privately and leaves no temporary files',()=>temp(async dir=>{
 const {io,handles}=instrumentIO(),output=path.join(dir,'private.json'),writer=await credentialWriter(output,{root,io});
 const first=[{phone:'fixture',password:'fixture-password'}];await writer.save(first);await writer.save([...first,{phone:'fixture-two'}]);
 assert.equal(JSON.parse(await fs.readFile(output,'utf8')).length,2);assert.equal((await fs.stat(output)).mode&0o777,0o600);
 assert(handles.every(h=>h.closed&&h.closes===1));assert.deepEqual(await fs.readdir(dir),['private.json']);
}));
for(const fault of ['write','sync','close','open-temp'])test(`credential ${fault} failure keeps the previous file and cleans only owned temporary files`,()=>temp(async dir=>{
 const output=path.join(dir,'private.json'),{io,handles}=instrumentIO(fault),writer=await credentialWriter(output,{root,io});
 const previous=await fs.readFile(output,'utf8');await assert.rejects(writer.save([{password:'fixture-only'}]),/Injected/);
 assert.equal(await fs.readFile(output,'utf8'),previous);assert(handles.every(h=>h.closed));assert.deepEqual(await fs.readdir(dir),['private.json']);
}));
test('failed initial credential reservation is closed and removed before any account can be created',()=>temp(async dir=>{
 const {io,handles}=instrumentIO('reserve'),output=path.join(dir,'private.json');
 await assert.rejects(credentialWriter(output,{root,io}),/Injected reserve/);assert(handles.every(h=>h.closed));assert.deepEqual(await fs.readdir(dir),[]);
}));
test('directory sync failure reports failure but preserves a complete renamed credential file and closes handles',()=>temp(async dir=>{
 const {io,handles}=instrumentIO('directory-sync'),output=path.join(dir,'private.json'),writer=await credentialWriter(output,{root,io}),records=[{phone:'fixture',password:'fixture-only'}];
 await assert.rejects(writer.save(records),/Injected sync/);assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),records);assert(handles.every(h=>h.closed));assert.deepEqual(await fs.readdir(dir),['private.json']);
}));
test('invalid manifest, missing database employees and invalid mapping config stop before remote writes or credential creation',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'never.json');
 for(const scenario of ['manifest','employees','mapping']){
  const fake=mock(),request=fake.backend.request;let calls=0;
  const list=records();if(scenario==='manifest')list[3].employeeId='NV99';await fs.writeFile(manifest,JSON.stringify(list));
  fake.backend.request=async(...args)=>{calls++;if(scenario==='employees'&&args[0].startsWith('/rest/v1/employees?'))return employees.slice(1);return request(...args);};
  if(scenario==='mapping')fake.backend.settings={authMode:'staging-email'};
  await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}));assert.equal(fake.created.length,0);assert.equal(fake.profiles.length,0);if(scenario!=='employees')assert.equal(calls,0);await assert.rejects(fs.access(output),{code:'ENOENT'});
 }
}));
test('malformed manifest errors do not echo potentially private file contents',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'never.json');await fs.writeFile(manifest,'[{"password":"PRIVATE_FIXTURE_DO_NOT_ECHO" INVALID');const fake=mock();let calls=0;
 fake.backend.request=async()=>{calls++;throw new Error('Must not connect');};
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),error=>error.message==='Manifest must be valid JSON. No accounts were created.');assert.equal(calls,0);await assert.rejects(fs.access(output),{code:'ENOENT'});
}));
test('credential write failure prevents the one-way Auth request',t=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'private.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock(),open=fs.open;
 t.mock.method(fs,'open',async(file,...args)=>{if(file.endsWith('.tmp'))throw new Error('Injected disk full');return open(file,...args);});
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/Injected disk full/);assert.equal(fake.created.length,0);assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),[]);
}));
test('unexpected Auth response never creates a profile or overwrites an existing owner',()=>temp(async dir=>{
 const {validateCreatedUser}=require('../../scripts/provision-lib.cjs'),id=randomUUID(),expected={email:'fixture@2ce-staging.invalid'};
 for(const user of [null,{}, {id:'invalid'},{id,email:expected.email},{id,email:'wrong@2ce-staging.invalid',email_confirmed_at:'confirmed'}])assert.throws(()=>validateCreatedUser(user,expected,[],[]),/Auth creation/);
 const good={id,email:expected.email,email_confirmed_at:'confirmed'};assert.doesNotThrow(()=>validateCreatedUser(good,expected,[],[]));assert.throws(()=>validateCreatedUser(good,expected,[{id}],[]),/identity mismatch/);assert.throws(()=>validateCreatedUser(good,expected,[],[{id}]),/identity mismatch/);
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'private.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock(),request=fake.backend.request;
 fake.backend.request=async(...args)=>{const result=await request(...args);return args[0]==='/auth/v1/admin/users'?{...result,phone:'+447700900199'}:result;};
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/identity mismatch/);assert.equal(fake.users.length,1);assert.equal(fake.profiles.length,0);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).length,1);
}));
test('lost Auth creation response retains credentials and retry refuses the orphan without resetting passwords',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'private.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock(),request=fake.backend.request;
 fake.backend.request=async(...args)=>{const result=await request(...args);if(args[0]==='/auth/v1/admin/users')throw new Error('Injected lost response');return result;};
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/Injected lost response/);assert.equal(fake.users.length,1);assert.equal(fake.profiles.length,0);
 assert.equal(JSON.parse(await fs.readFile(output,'utf8'))[0].password,fake.created[0].password);
 await assert.rejects(provision({manifest,output:path.join(dir,'retry.json'),bootstrap:true,backend:fake.backend}),/without matching profile/);assert.equal(fake.created.length,1);await assert.rejects(fs.access(path.join(dir,'retry.json')),{code:'ENOENT'});
}));
test('bootstrap profile failure retains credentials and stops before creating later accounts',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'private.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock(),request=fake.backend.request;
 fake.backend.request=async(...args)=>{if(args[0]==='/rest/v1/profiles')throw new Error('Injected bootstrap profile failure');return request(...args);};
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/Injected bootstrap profile/);assert.equal(fake.created.length,1);assert.equal(fake.profiles.length,0);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).length,1);
}));
test('bootstrap audit failure cannot be silently skipped on a retry',()=>temp(async dir=>{
 const manifest=path.join(dir,'manifest.json'),output=path.join(dir,'private.json');await fs.writeFile(manifest,JSON.stringify(records()));const fake=mock(),request=fake.backend.request;
 fake.backend.request=async(...args)=>{if(args[0]==='/rest/v1/audit_logs')throw new Error('Injected audit failure');return request(...args);};
 await assert.rejects(provision({manifest,output,bootstrap:true,backend:fake.backend}),/Injected audit failure/);assert.equal(fake.created.length,1);assert.equal(fake.profiles.length,1);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).length,1);
 await assert.rejects(provision({manifest,output:path.join(dir,'retry.json'),backend:fake.backend}),/Administrator audit record is missing/);assert.equal(fake.created.length,1);await assert.rejects(fs.access(path.join(dir,'retry.json')),{code:'ENOENT'});
}));
