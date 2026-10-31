const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {randomBytes,randomUUID}=require('node:crypto');
const {SupabaseBackend}=require('../../server/supabase.cjs');const {database,profiles}=require('./helpers.cjs');
let db;before(async()=>{db=await database();});after(async()=>{await db?.close();});
test('Admin account creation delegates password only to Auth and saves/audits a password-free profile',async()=>{
 const backend=new SupabaseBackend({}),calls=[];const id=randomUUID(),password=randomBytes(18).toString('hex');
 backend.request=async(path,options)=>{
  calls.push([path,options]);
  if(path.startsWith('/rest/v1/profiles?phone='))return[];
  if(path==='/auth/v1/admin/users'){assert.equal(options.body.phone_confirm,true);await db.query('insert into auth.users(id) values($1)',[id]);return{id};}
  if(path==='/rest/v1/rpc/manage_profile'){await db.query('select manage_profile($1,$2,$3,$4,$5,$6,$7,$8)',Object.values(options.body));return null;}
  throw new Error('Unexpected '+path);
 };
 const result=await backend.admin(profiles.admin,{phone:'+84900000005',displayName:'Quản lý mới',role:'manager',active:true,password,requestId:randomUUID()});
 assert.equal(result.id,id);assert.equal((await db.query('select role from profiles where id=$1',[id])).rows[0].role,'manager');
 const profile=(await db.query('select * from profiles where id=$1',[id])).rows[0];assert(!JSON.stringify(profile).includes(password));
 const rpc=calls.find(([path])=>path.includes('/rpc/'))[1];assert(!JSON.stringify(rpc).includes(password));
 assert.equal((await db.query("select count(*)::int as n from audit_logs where action='account_update'")).rows[0].n,1);
});
test('Admin API validates role, password, employee mapping and blocks self changes',async()=>{
 const backend=new SupabaseBackend({});backend.request=async()=>[];backend.profile=async()=>profiles.admin;
 const base={phone:profiles.admin.phone,displayName:'Admin',role:'manager',active:true,requestId:randomUUID()};
 await assert.rejects(backend.admin(profiles.admin,{...base,id:profiles.admin.id}),e=>e.status===400);
 await assert.rejects(backend.admin(profiles.admin,{...base,role:'root'}),e=>e.status===400);
 await assert.rejects(backend.admin(profiles.admin,{...base,password:'short'}),e=>e.status===400);
 await assert.rejects(backend.admin(profiles.admin,{...base,role:'employee',employeeId:'NV99',password:'long-test-only-password'}),e=>e.status===400);
});
