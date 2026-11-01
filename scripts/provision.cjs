'use strict';
// Trusted operator only. Auth and database calls remain outside the browser.
const fs=require('node:fs/promises'),path=require('node:path'),{parseArgs}=require('node:util');
const {randomBytes,randomUUID}=require('node:crypto');
const {SupabaseBackend,config}=require('../server/supabase.cjs');
const {week:validateWeek}=require('../server/validation.cjs');
const {validateManifest,checkExisting,validateEmployees,validateCreatedUser,credentialWriter}=require('./provision-lib.cjs');
const employees=require('../server/employees.cjs');
const {identity}=require('../server/demo-auth.cjs');
async function provision({manifest,output,bootstrap=false,seedWeek,backend,root=path.resolve(__dirname,'..')}){
 if(!manifest||!output)throw new Error('Provide --manifest and --credentials-out paths.');
 const source=await fs.readFile(manifest,'utf8');let parsed;
 try{parsed=JSON.parse(source);}catch{throw new Error('Manifest must be valid JSON. No accounts were created.');}
 const records=validateManifest(parsed);
 if(seedWeek)validateWeek(seedWeek);
 backend=backend||new SupabaseBackend(config());
 // Resolve every identity and verify personnel before any credential/Auth writes.
 const identities=new Map(records.map(record=>[record.phone,identity(record.phone,backend.settings)]));
 validateEmployees(await backend.request('/rest/v1/employees?select=id&order=id.asc',{service:true}));
 // Check a requested seed destination before creating accounts or credential files.
 if(seedWeek&&(await backend.snapshot(seedWeek)).exists)throw new Error('Week already exists; no accounts or data were changed. Choose an unused week.');
 const existing=await backend.accounts(),users=[];
 for(let page=1;;page++){
  const result=await backend.request(`/auth/v1/admin/users?page=${page}&per_page=1000`,{service:true});
  users.push(...result.users);if(result.users.length<1000)break;
 }
 let administrator=checkExisting(records,existing,users,bootstrap,backend.settings);
 // Bootstrap profile/audit writes are separate requests. Never silently skip a
 // profile whose bootstrap stopped before its audit record was persisted.
 if(administrator){
  const history=await backend.request(`/rest/v1/audit_logs?select=id&fingerprint=eq.${encodeURIComponent(administrator.id)}&action=in.(account_bootstrap,account_update)&limit=1`,{service:true});
  if(!Array.isArray(history)||!history.length)throw new Error('Administrator audit record is missing. Review the interrupted bootstrap before retrying; no accounts were created.');
 }
 const writer=await credentialWriter(output,{root});
 const credentials=[];
 for(const record of [...records].sort((a,b)=>(a.role==='admin'?-1:0)-(b.role==='admin'?-1:0))){
  if(existing.some(p=>p.phone===record.phone))continue;
  const password=randomBytes(24).toString('base64url');
  credentials.push({phone:record.phone,password,role:record.role,employeeId:record.employeeId||null});
  // The entire file is durably replaced BEFORE making the one-way Auth call.
  await writer.save(credentials);
  const expectedIdentity=identities.get(record.phone);
  const user=await backend.request('/auth/v1/admin/users',{method:'POST',service:true,body:{...expectedIdentity,password}});
  validateCreatedUser(user,expectedIdentity,users,existing);
  users.push(user);
  const person=employees.find(e=>e.id===record.employeeId);
  const profile={id:user.id,phone:record.phone,display_name:person?.name||record.displayName||(record.role==='admin'?'Quản trị viên 2CE':'Quản lý 2CE'),role:record.role,employee_id:record.employeeId||null,active:true};
  if(!administrator&&record.role==='admin'){
   await backend.request('/rest/v1/profiles',{method:'POST',service:true,body:profile});administrator=profile;
   await backend.request('/rest/v1/audit_logs',{method:'POST',service:true,body:{actor:profile.id,request_id:randomUUID(),action:'account_bootstrap',fingerprint:profile.id,result:{role:'admin'}}});
  }else{
   await backend.rpc('manage_profile',{p_actor:administrator.id,p_target:profile.id,p_phone:profile.phone,p_name:profile.display_name,p_role:profile.role,p_employee:profile.employee_id,p_active:true,p_request:randomUUID()});
  }
  existing.push(profile);
 }
 if(seedWeek){
  const manager=existing.find(p=>p.role==='manager'&&p.active);
  const state=require('./submitted-demo.cjs')();
  require('../server/planning.cjs').generate(state, employees);
  await backend.commit({p_actor:manager.id,p_action:'demo_seed',p_expected_employee_id:null,p_request:randomUUID(),p_week:seedWeek,p_revision:0,p_fingerprint:'initial-demo-v1',p_state:state,p_result:{message:'Demo registrations imported; registered-shift eligibility applied.'}});
 }
 return{created:credentials.length};
}
if(require.main===module){
 (async()=>{
  const {values}=parseArgs({options:{manifest:{type:'string'},'credentials-out':{type:'string'},bootstrap:{type:'boolean'},'seed-week':{type:'string'}}});
  const result=await provision({manifest:values.manifest,output:values['credentials-out'],bootstrap:values.bootstrap,seedWeek:values['seed-week']});
  console.log(`Provisioning completed. ${result.created} new credential sets saved privately. No passwords were printed.`);
 })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={provision};
