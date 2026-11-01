'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes,randomUUID,createHash}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {demoConfig,internalEmail}=require('../../server/demo-auth.cjs');
const {SupabaseBackend,config,decrypt}=require('../../server/supabase.cjs');
const {createHandler}=require('../../server/handler.cjs');
const {profiles,invoke}=require('./helpers.cjs');
const cfg=()=>({url:'https://demo.supabase.co',origin:'http://localhost:4173',publicKey:'sb_publishable_fixture',secretKey:'sb_secret_fixture',key:randomBytes(32),authMode:'staging-email',authMappingKey:randomBytes(32)});
test('email mapping normalizes numbers, hides phone and separates unique identifiers',()=>{const c=cfg(),a=internalEmail('0900 000 003',c);assert.equal(a,internalEmail('+84900000003',c));assert.match(a,/^[a-f0-9]{64}@2ce-staging\.invalid$/);assert(!a.includes('900000003'));assert.notEqual(a,internalEmail('+84900000004',c));assert.notEqual(a,internalEmail('+84900000003',cfg()));assert.throws(()=>internalEmail('not-a-number',c));});
test('staging mode fails closed for production, incorrect project and missing mapping key',()=>{
 const e={TWOCE_AUTH_MODE:'staging-email',TWOCE_ENV:'staging',TWOCE_STAGING_SUPABASE_URL:'https://demo.supabase.co',AUTH_MAPPING_KEY:randomBytes(32).toString('base64')};assert.equal(demoConfig(e,e.TWOCE_STAGING_SUPABASE_URL).authMode,'staging-email');
 for(const x of [{TWOCE_ENV:'production'},{VERCEL_ENV:'production'},{TWOCE_STAGING_SUPABASE_URL:'https://other.supabase.co'},{AUTH_MAPPING_KEY:''},{TWOCE_AUTH_MODE:'typo'}])assert.throws(()=>demoConfig({...e,...x},e.TWOCE_STAGING_SUPABASE_URL),{status:503});
 assert.equal(demoConfig({},e.TWOCE_STAGING_SUPABASE_URL).authMode,'phone');
 assert.throws(()=>config({SUPABASE_URL:e.TWOCE_STAGING_SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:'x',SUPABASE_SECRET_KEY:'y',APP_ORIGIN:'https://app.test',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),...e,VERCEL_ENV:'production'}),{status:503});
});
function fixture(mode='ok'){
 const settings=cfg(),calls=[];let session;
 const email=internalEmail(profiles.employee.phone,settings);
 const backend=new SupabaseBackend(settings,async(url,o)=>{
  const p=new URL(url).pathname,body=o.body?JSON.parse(o.body):null;calls.push({p,body,headers:o.headers});let data,status=200;
  if(p.endsWith('/consume_login_limit'))data=mode!=='limited';
  else if(p==='/auth/v1/token'){
   if(['wrong','unknown','banned'].includes(mode)){status=mode==='banned'?403:400;data={error:'private auth detail'};}
   else data={access_token:'private-access',refresh_token:'private-refresh',user:{id:profiles.employee.id,email:mode==='wrong-email'?'other@2ce-staging.invalid':email,email_confirmed_at:mode==='unconfirmed'?null:new Date().toISOString()}};
  } else if(p==='/rest/v1/profiles')data=mode==='orphan'?[]:[{...profiles.employee,id:mode==='wrong-id'?profiles.other.id:profiles.employee.id,phone:mode==='wrong-owner'?profiles.other.phone:profiles.employee.phone,active:mode!=='inactive'}];
  else if(p==='/rest/v1/web_sessions'){session=body;data=null;}
  else throw Error('Unexpected fixture path');
  return new Response(JSON.stringify(data),{status});
 });return{backend,calls,settings,get session(){return session;}};
}
test('phone UI authenticates through Supabase email/password, opaque cookie and encrypted tokens only',async()=>{
 const f=fixture(),h=createHandler({backend:f.backend,origin:f.settings.origin});const r=await invoke(h,{method:'POST',body:{action:'login',phone:'0900 000 003',password:'fixture-password'}});
 assert.equal(r.status,200);assert.match(r.headers['set-cookie'],/HttpOnly; SameSite=Strict/);const auth=f.calls.find(c=>c.p==='/auth/v1/token');assert.equal(auth.body.email,internalEmail(profiles.employee.phone,f.settings));assert.equal(auth.body.password,'fixture-password');assert.equal(auth.body.phone,undefined);assert.equal(auth.headers.apikey,f.settings.publicKey);
 assert.equal(f.calls.filter(c=>c.p.endsWith('consume_login_limit')).length,2);assert(!JSON.stringify(r).includes('@2ce-staging.invalid'));assert(!JSON.stringify(r).includes('private-access'));assert(!JSON.stringify(r).includes(f.settings.secretKey));assert.equal(decrypt(f.session.encrypted_tokens,f.settings.key).access_token,'private-access');assert.equal(f.session.user_id,profiles.employee.id);
});
test('unknown, wrong password, banned, inactive, orphan and wrong ownership share one login error and no session',async()=>{
 let expected;
 for(const mode of ['wrong','unknown','banned','inactive','orphan','wrong-owner','wrong-id','wrong-email','unconfirmed']){const f=fixture(mode),h=createHandler({backend:f.backend,origin:f.settings.origin});const r=await invoke(h,{method:'POST',body:{action:'login',phone:profiles.employee.phone,password:'fixture'}});assert.equal(r.status,401,mode);if(!expected)expected=r.data;assert.deepEqual(r.data,expected,mode);assert.equal(f.session,undefined);assert.equal(f.calls.filter(c=>c.p.endsWith('consume_login_limit')).length,2);}
});
test('rate limiting precedes Supabase authentication and rejects excess attempts without identity lookup',async()=>{const f=fixture('limited');await assert.rejects(f.backend.login(profiles.employee.phone,'fixture','local'),{status:429});assert(!f.calls.some(c=>c.p==='/auth/v1/token'||c.p==='/rest/v1/profiles'));});
test('provisioning 20 confirmed email identities preserves UUID/phone ownership, private credentials and retry checks',async()=>{
 const {provision}=require('../../scripts/provision.cjs'),{checkExisting}=require('../../scripts/provision-lib.cjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'2ce-email-'));const settings=cfg(),users=[],stored=[],created=[];
 const backend={settings,accounts:async()=>structuredClone(stored),request:async(p,o)=>{
  if(p==='/rest/v1/employees?select=id&order=id.asc')return require('../../server/employees.cjs').map(e=>({id:e.id}));
  if(p.startsWith('/rest/v1/audit_logs?'))return[{id:randomUUID()}];
  if(p.startsWith('/auth/v1/admin/users?'))return{users};
  if(p==='/auth/v1/admin/users'){created.push(o.body);const u={id:randomUUID(),email:o.body.email,email_confirmed_at:new Date().toISOString()};users.push(u);return u;}
  if(p==='/rest/v1/profiles'){stored.push(o.body);return null;}if(p==='/rest/v1/audit_logs')return null;throw Error('Unexpected');
 },rpc:async(n,p)=>stored.push({id:p.p_target,phone:p.p_phone,role:p.p_role,employee_id:p.p_employee,active:p.p_active})};
 try{
  const records=require('../../scripts/accounts.staging.json'),manifest=path.join(dir,'manifest.json'),output=path.join(dir,'credentials.json');await fs.writeFile(manifest,JSON.stringify(records));
  assert.equal((await provision({manifest,output,bootstrap:true,backend})).created,20);assert.equal(new Set(users.map(u=>u.email)).size,20);assert(created.every(b=>b.email_confirm===true&&!Object.hasOwn(b,'phone')&&!Object.hasOwn(b,'phone_confirm')));assert.equal(stored.length,20);
  for(const p of stored)assert.equal(users.find(u=>u.id===p.id).email,internalEmail(p.phone,settings));
  const privateFile=await fs.readFile(output,'utf8');assert(!privateFile.includes('@2ce-staging.invalid'));assert.equal((await fs.stat(output)).mode&0o777,0o600);
  assert.equal((await provision({manifest,output:path.join(dir,'retry.json'),backend})).created,0);assert.equal(created.length,20);
  assert.throws(()=>checkExisting(records,stored,users,true,{...settings,authMappingKey:randomBytes(32)}),/identity does not match/);
  const swapped=structuredClone(users);[swapped[2].id,swapped[3].id]=[swapped[3].id,swapped[2].id];assert.throws(()=>checkExisting(records,stored,swapped,true,settings),/identity does not match/);
  assert.throws(()=>checkExisting(records,stored.slice(0,19),users,true,settings),/without matching profile/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Admin-created staging accounts use confirmed email identities without exposing email in profile RPC/result',async()=>{
 const b=new SupabaseBackend(cfg()),calls=[],id=randomUUID();b.request=async(p,o)=>{calls.push([p,o]);if(p==='/auth/v1/admin/users')return{id};return[];};
 const result=await b.admin(profiles.admin,{phone:'+447700900150',displayName:'Demo',role:'manager',active:true,password:'long-test-password',requestId:randomUUID()});
 const created=calls.find(([p])=>p==='/auth/v1/admin/users')[1].body;assert.equal(created.email_confirm,true);assert.equal(created.phone,undefined);assert(!JSON.stringify(result).includes(created.email));assert(!JSON.stringify(calls.find(([p])=>p.endsWith('/manage_profile'))).includes(created.email));
});
test('session refresh, encryption transport and rate-limit implementation preserved byte-for-byte',async()=>{const source=await fs.readFile(path.join(__dirname,'../../server/supabase.cjs'),'utf8'),baseline=require('../legacy/auth-transport-baseline.json');for(const [name,hash]of Object.entries(baseline)){const code=source.match(new RegExp('^  async '+name+'\\([\\s\\S]*?^  }','m'))[0];assert.equal(createHash('sha256').update(code).digest('hex'),hash,name);}});
test('account verifier requires exact live authorization before any network access',async()=>{const {verify}=require('../../scripts/check-staging-accounts.cjs');let called=false;await assert.rejects(verify({},{accounts:async()=>{called=true;return[];}}),/BLOCKED/);assert.equal(called,false);});
test('client cannot choose an internal email, invoke public signup or bypass same-origin CSRF',async()=>{
 const f=fixture(),h=createHandler({backend:f.backend,origin:f.settings.origin});
 for(const body of [{action:'signup',phone:profiles.employee.phone,password:'fixture'},{action:'login',phone:profiles.employee.phone,password:'fixture',email:'attacker@2ce-staging.invalid'}])assert.equal((await invoke(h,{method:'POST',body})).status,400);
 assert.equal((await invoke(h,{method:'POST',origin:'https://other.test',body:{action:'login',phone:profiles.employee.phone,password:'fixture'}})).status,403);assert.equal(f.calls.length,0);
 const {checkExisting}=require('../../scripts/provision-lib.cjs');assert.throws(()=>checkExisting([{phone:profiles.employee.phone}],[],[{id:randomUUID(),phone:profiles.employee.phone}],true,f.settings),/Legacy phone identity/);
});
