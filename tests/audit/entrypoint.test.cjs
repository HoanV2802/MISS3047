const {test}=require('node:test'),assert=require('node:assert/strict');
test('Vercel entrypoint fails closed without configuration and makes no upstream request',async()=>{
 const old=process.env.SUPABASE_URL,originalFetch=global.fetch;let calls=0;process.env.SUPABASE_URL='invalid';global.fetch=async()=>{calls++;throw new Error('Must not connect');};
 try{const entry=require('../../api/[route].js');let value;const res={setHeader(){},end(body){value=JSON.parse(body);}};await entry({method:'GET',url:'/api/auth',headers:{}},res);assert.equal(res.statusCode,503);assert.equal(value.code,'CONFIGURATION');assert.equal(calls,0);assert(!JSON.stringify(value).includes('stack'));}
 finally{global.fetch=originalFetch;if(old===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old;}
});
