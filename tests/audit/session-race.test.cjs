'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {SupabaseBackend,encrypt,decrypt,hash}=require('../../server/supabase.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
test('a non-refresh request cannot discard tokens rotated by a concurrent refresh',async()=>{
 const key=randomBytes(32),session=randomBytes(32).toString('base64url'),userId='10000000-0000-4000-8000-000000000003';
 let stored={id:hash(session),user_id:userId,revision:0,encrypted_tokens:encrypt({access_token:'old',refresh_token:'old-refresh'},key),last_seen:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()};
 const bothRead=deferred(),refreshStarted=deferred(),touchCompleted=deferred();let reads=0,userCalls=0,patches=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);let result,status=200;
  if(u.pathname==='/rest/v1/web_sessions'&&options.method==='GET'){
   const snapshot=structuredClone(stored);if(u.searchParams.get('select')==='*'){if(++reads===2)bothRead.resolve();await bothRead.promise;}result=[snapshot];
  } else if(u.pathname==='/auth/v1/user') {if(++userCalls===2){status=401;result={};}else result={id:userId};}
  else if(u.pathname==='/auth/v1/token'){refreshStarted.resolve();await touchCompleted.promise;result={access_token:'new',refresh_token:'new-refresh'};}
  else if(u.pathname==='/rest/v1/profiles'){await refreshStarted.promise;result=[{id:userId,role:'employee',employee_id:'NV01',active:true}];}
  else if(u.pathname==='/rest/v1/web_sessions'&&options.method==='PATCH'){
   const expected=u.searchParams.get('revision');
   if(expected&&Number(expected.slice(3))!==stored.revision)result=[];
   else {stored={...stored,...JSON.parse(options.body)};result=[stored];}
   if(++patches===1)touchCompleted.resolve();
  }else throw new Error('Unexpected '+url);
  return new Response(JSON.stringify(result),{status});
 };
 const backend=new SupabaseBackend({url:'https://fixture.test',publicKey:'sb_publishable_fixture',secretKey:'sb_secret_fixture',key},fetcher);
 await Promise.all([backend.authenticate(session),backend.authenticate(session)]);
 assert.equal(decrypt(stored.encrypted_tokens,key).refresh_token,'new-refresh');
});
