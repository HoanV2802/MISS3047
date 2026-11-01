'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('../../scripts/staging-preflight.cjs');
const valid={APP_ORIGIN:'http://localhost:4173',SUPABASE_URL:'https://staging.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture',SESSION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
test('offline preflight validates configuration without disclosing its values',()=>{
 assert.equal(inspect(valid).ready,true);assert.equal(inspect({}).ready,false);
 const secret='DO_NOT_PRINT_THIS_SECRET';const result=inspect({...valid,SUPABASE_URL:secret,SUPABASE_SECRET_KEY:secret,SESSION_ENCRYPTION_KEY:secret});
 assert.equal(result.ready,false);assert(!JSON.stringify(result).includes(secret));
});
test('offline preflight rejects unsafe origins, wrong encryption length, wrong key kind and wrong project',()=>{
 for(const change of [{APP_ORIGIN:'https://app.test/'},{SUPABASE_URL:'http://staging.supabase.co'},{SUPABASE_URL:'https://user:password@staging.supabase.co'},{SESSION_ENCRYPTION_KEY:Buffer.alloc(31).toString('base64')},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},{TEST_EXPECTED_SUPABASE_URL:'https://other.supabase.co'},{PORT:'0'}])assert.equal(inspect({...valid,...change}).ready,false);
 const legacy={...valid,SUPABASE_SECRET_KEY:undefined,SUPABASE_SERVICE_ROLE_KEY:'eyJfixture.payload.signature'};assert.equal(inspect(legacy).ready,true);
});
test('fake staging manifest contains exactly the existing 20 roles/identities and no passwords',()=>{
 const manifest=require('../../scripts/accounts.staging.json');const {validateManifest}=require('../../scripts/provision-lib.cjs');
 assert.equal(validateManifest(manifest).length,20);assert(manifest.every(r=>/^\+4477009001\d\d$/.test(r.phone)));assert(manifest.every(r=>!Object.hasOwn(r,'password')));
});
test('read-only staging identity SQL detects mismatched Auth identity and missing employee profiles',async()=>{
 const {database,ids}=require('../backend/helpers.cjs'),fs=require('node:fs/promises'),path=require('node:path');const db=await database();
 try{
  const schemaResults=await db.exec(await fs.readFile(path.join(__dirname,'../../scripts/check-supabase.sql'),'utf8'));
  const schemaRows=schemaResults.flatMap(r=>r.rows);
  assert.equal(schemaRows.filter(r=>r.rowsecurity===true).length,12);
  assert.equal(schemaRows.filter(r=>r.prosecdef===true&&r.service_execute===true&&r.anon_execute===false&&r.authenticated_execute===false).length,4);
  assert.equal(Number(schemaRows.find(r=>Object.hasOwn(r,'employees')).employees),18);
  await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz, add column email text, add column email_confirmed_at timestamptz; update auth.users u set phone=ltrim(p.phone,\'+\'),phone_confirmed_at=now() from profiles p where p.id=u.id;');
  const sql=await fs.readFile(path.join(__dirname,'../../scripts/check-staging-identities.sql'),'utf8');
  let results=await db.exec(sql);const value=(rows,key)=>rows.flatMap(r=>r.rows).find(r=>Object.hasOwn(r,key))[key];
  assert.equal(Number(value(results,'identity_mismatches')),0);assert.equal(Number(value(results,'employees_without_active_profile')),16);
  await db.query('update auth.users set phone_confirmed_at=null where id=$1',[ids.employee]);results=await db.exec(sql);assert.equal(Number(value(results,'identity_mismatches')),1);
 }finally{await db.close();}
});
