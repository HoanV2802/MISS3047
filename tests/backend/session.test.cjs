const {test}=require('node:test');const assert=require('node:assert/strict');const {randomBytes}=require('node:crypto');
const {SupabaseBackend,encrypt,decrypt,hash}=require('../../server/supabase.cjs');
const {profiles}=require('./helpers.cjs');
const settings=()=>({url:'https://supabase.test',publicKey:'public-test',secretKey:'secret-test',origin:'https://2ce.test',key:randomBytes(32)});
function fixture({expired=false,accessExpired=false,refreshFailed=false,inactive=false}={}){
 const cfg=settings(),session=randomBytes(32).toString('base64url');let stored={id:hash(session),user_id:profiles.employee.id,revision:0,encrypted_tokens:encrypt({access_token:'old',refresh_token:'refresh'},cfg.key),last_seen:new Date().toISOString(),expires_at:new Date(Date.now()+(expired?-1:600000)).toISOString()};
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push([url,options]);let data,status=200;
  if(url.includes('/web_sessions')){if(options.method==='DELETE'){stored=null;data=null;}else if(options.method==='PATCH'){stored={...stored,...JSON.parse(options.body)};data=[stored];}else data=stored?[stored]:[];}
  else if(url.includes('/auth/v1/user')){if(accessExpired&&options.headers.Authorization==='Bearer old'){data={};status=401;}else data={id:profiles.employee.id};}
  else if(url.includes('/token?grant_type=refresh_token')){if(refreshFailed){status=400;data={};}else data={access_token:'new',refresh_token:'rotated'};}
  else if(url.includes('/profiles'))data=[{...profiles.employee,active:!inactive}];
  else throw new Error('Unexpected request: '+url);
  return new Response(JSON.stringify(data),{status});
 };
 return{backend:new SupabaseBackend(cfg,fetcher),session,calls,get stored(){return stored;}};
}
test('AES-GCM session data is authenticated and tampering fails',()=>{const key=randomBytes(32),sealed=encrypt({access_token:'private'},key);assert(!sealed.includes('private'));assert.equal(decrypt(sealed,key).access_token,'private');const damaged=Buffer.from(sealed,'base64');damaged[30]^=1;assert.throws(()=>decrypt(damaged.toString('base64'),key));});
test('expired JWT is verified with Auth, refreshed, rotated and encrypted server-side',async()=>{const f=fixture({accessExpired:true});const profile=await f.backend.authenticate(f.session);assert.equal(profile.id,profiles.employee.id);assert(f.calls.some(([url])=>url.includes('grant_type=refresh_token')));assert.equal(f.stored.revision,1);});
test('expired application session, revoked refresh and inactive account fail closed',async()=>{for(const options of [{expired:true},{accessExpired:true,refreshFailed:true},{inactive:true}]){const f=fixture(options);await assert.rejects(f.backend.authenticate(f.session),e=>e.status===401||e.status===403);assert.equal(f.stored,null);}});
test('modern Supabase keys use apikey; only real user/legacy JWTs use Authorization',async()=>{
 const cfg={...settings(),publicKey:'sb_publishable_fixture',secretKey:'sb_secret_fixture'};const captured=[];
 const backend=new SupabaseBackend(cfg,async(url,options)=>{captured.push(options.headers);return new Response('{}',{status:200});});
 await backend.request('/rest/v1/profiles',{service:true});assert.equal(captured[0].apikey,cfg.secretKey);assert.equal(captured[0].Authorization,undefined);
 await backend.request('/auth/v1/user',{token:'signed-user-jwt'});assert.equal(captured[1].Authorization,'Bearer signed-user-jwt');assert.equal(captured[1].apikey,cfg.publicKey);
});
