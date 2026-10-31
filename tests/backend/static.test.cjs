const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {readBody}=require('../../server/handler.cjs');const {csp}=require('../../server/static.cjs');
const root=path.resolve(__dirname,'../..');
test('browser has no embedded credentials, inline executable handlers, eval or secret references',async()=>{
 const html=await fs.readFile(path.join(root,'index.html'),'utf8'),js=await fs.readFile(path.join(root,'app.js'),'utf8');
 assert(!/\son(?:click|change|submit)=/i.test(html+js));assert(!/\beval\s*\(|new Function\s*\(/.test(js));assert(!/SUPABASE_(?:SECRET|SERVICE_ROLE)|value="123"|pass !== '123'/.test(html+js));
 assert.match(csp,/script-src 'self';/);assert(!csp.includes("script-src 'self' 'unsafe-inline'"));
});
test('malformed JSON and oversized pre-parsed Vercel requests are rejected',async()=>{await assert.rejects(readBody({headers:{},body:'{bad'}),e=>e.status===400);await assert.rejects(readBody({headers:{},body:{data:'x'.repeat(17000)}}),e=>e.status===413);});
