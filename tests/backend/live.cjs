'use strict';
// Read-only live checks. Never seeds, resets or deletes shared application data.
const {test}=require('node:test');const assert=require('node:assert/strict');
const missing=require('../audit/live-gate.cjs').liveBlockers();
const skip=missing.length?`BLOCKED: ${missing.join(', ')}`:false;
test('LIVE: real phone/password authentication and manager/employee RLS isolation',{skip},async()=>{
 const {SupabaseBackend}=require('../../server/supabase.cjs');const {phone}=require('../../server/validation.cjs');const backend=new SupabaseBackend();
 for(const role of ['MANAGER','EMPLOYEE']){
   const number=phone(process.env[`TEST_${role}_PHONE`]);
   const identifier=backend.settings.authMode==='staging-email'?{email:require('../../server/demo-auth.cjs').internalEmail(number,backend.settings)}:{phone:number};
   const tokens=await backend.request('/auth/v1/token?grant_type=password',{method:'POST',body:{...identifier,password:process.env[`TEST_${role}_PASSWORD`]}});
   const user=await backend.request('/auth/v1/user',{token:tokens.access_token});const profile=await backend.profile(user.id);assert.equal(profile.role,role.toLowerCase());
   const visible=await backend.request('/rest/v1/employees?select=id',{token:tokens.access_token});
   if(role==='EMPLOYEE')assert.deepEqual(visible.map(e=>e.id),[profile.employee_id]);else assert.equal(visible.length,18);
 }
});
test('LIVE: anonymous PostgREST access is denied',{skip},async()=>{
 const {SupabaseBackend}=require('../../server/supabase.cjs');const backend=new SupabaseBackend();
 await assert.rejects(backend.request('/rest/v1/profiles?select=id'),error=>[401,403].includes(error.status));
});
