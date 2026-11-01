'use strict';
const {SupabaseBackend}=require('../server/supabase.cjs');
const {validateManifest,checkExisting}=require('./provision-lib.cjs');
async function verify(env=process.env,backend){
  if(env.TWOCE_LIVE_AUTHORIZED!=='dedicated-demo'||!env.TEST_EXPECTED_SUPABASE_URL||env.TEST_EXPECTED_SUPABASE_URL!==env.SUPABASE_URL)throw Error('BLOCKED: authorize the exact staging project before checking accounts.');
  backend=backend||new SupabaseBackend();
  const records=validateManifest(require('./accounts.staging.json')),profiles=await backend.accounts(),users=[];
  for(let page=1;;page++){const result=await backend.request(`/auth/v1/admin/users?page=${page}&per_page=1000`,{service:true});users.push(...result.users);if(result.users.length<1000)break;}
  checkExisting(records,profiles,users,false,backend.settings);
  if(records.some(r=>!profiles.some(p=>p.phone===r.phone)))throw Error('Staging accounts are missing.');
  return {verifiedAccounts:records.length,mode:backend.settings.authMode||'phone'};
}
if(require.main===module)verify().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Staging identity verification blocked or failed; check authorization, mapping key, confirmed identities and profiles privately.');process.exitCode=1;});
module.exports={verify};
