const {test}=require('node:test'),assert=require('node:assert/strict');const {liveBlockers}=require('./live-gate.cjs');
test('live checks require explicit staging authorization and exact project identity even when credentials exist',()=>{
 const configured={SUPABASE_URL:'https://demo.test',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture',SESSION_ENCRYPTION_KEY:'fixture',APP_ORIGIN:'https://app.test',TEST_MANAGER_PHONE:'fixture',TEST_MANAGER_PASSWORD:'fixture',TEST_EMPLOYEE_PHONE:'fixture',TEST_EMPLOYEE_PASSWORD:'fixture'};
 assert(liveBlockers(configured).length);const approved={...configured,TWOCE_LIVE_AUTHORIZED:'dedicated-demo',TEST_EXPECTED_SUPABASE_URL:configured.SUPABASE_URL};assert.deepEqual(liveBlockers(approved),[]);
 assert(liveBlockers({...approved,TEST_EXPECTED_SUPABASE_URL:'https://different.test'}).length);
 assert(liveBlockers({...approved,TEST_API_ORIGIN:'https://app.test'},{api:true,write:true}).length);
 assert.deepEqual(liveBlockers({...approved,TEST_API_ORIGIN:'https://app.test',TWOCE_LIVE_WRITE_AUTHORIZED:'new-test-week',TEST_WEEK:'2030-01-07'},{api:true,write:true}),[]);
});
