'use strict';
function liveBlockers(env=process.env,{write=false,api=false}={}){
 const missing=[];
 if(env.TWOCE_LIVE_AUTHORIZED!=='dedicated-demo')missing.push('explicit dedicated-demo authorization');
 if(!env.TEST_EXPECTED_SUPABASE_URL||env.TEST_EXPECTED_SUPABASE_URL!==env.SUPABASE_URL)missing.push('exact expected Supabase project URL');
 for(const key of['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SESSION_ENCRYPTION_KEY','APP_ORIGIN','TEST_MANAGER_PHONE','TEST_MANAGER_PASSWORD','TEST_EMPLOYEE_PHONE','TEST_EMPLOYEE_PASSWORD'])if(!env[key])missing.push(key);
 if(!env.SUPABASE_SECRET_KEY&&!env.SUPABASE_SERVICE_ROLE_KEY)missing.push('SUPABASE_SECRET_KEY');
 if(api&&(!env.TEST_API_ORIGIN||env.TEST_API_ORIGIN!==env.APP_ORIGIN||!env.TEST_API_ORIGIN.startsWith('https://')))missing.push('matching HTTPS TEST_API_ORIGIN/APP_ORIGIN');
 if(write&&(env.TWOCE_LIVE_WRITE_AUTHORIZED!=='new-test-week'||!env.TEST_WEEK))missing.push('explicit new-test-week authorization and TEST_WEEK');
 return missing;
}
module.exports={liveBlockers};
