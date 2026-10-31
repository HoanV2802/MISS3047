'use strict';
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fail}=require('../../server/validation.cjs');
const domain=require('../../shared/domain.js');
const employees=require('../../server/employees.cjs');
const ids={admin:'10000000-0000-4000-8000-000000000001',manager:'10000000-0000-4000-8000-000000000002',employee:'10000000-0000-4000-8000-000000000003',other:'10000000-0000-4000-8000-000000000004'};
const profiles={admin:{id:ids.admin,phone:'+84900000001',display_name:'Quản trị thử nghiệm',role:'admin',active:true,employee_id:null},manager:{id:ids.manager,phone:'+84900000002',display_name:'Quản lý thử nghiệm',role:'manager',active:true,employee_id:null},employee:{id:ids.employee,phone:'+84900000003',display_name:employees[0].name,role:'employee',active:true,employee_id:'NV01'},other:{id:ids.other,phone:'+84900000004',display_name:employees[1].name,role:'employee',active:true,employee_id:'NV02'}};
async function database(directory) {
  const db=new PGlite(directory);
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for(const file of ['202610310001_backend.sql','202610310002_employees.sql']) await db.exec(await fs.readFile(path.join(__dirname,'../../supabase/migrations',file),'utf8'));
  for(const profile of Object.values(profiles)) {
    await db.query('insert into auth.users(id) values($1)',[profile.id]);
    await db.query('insert into profiles(id,phone,display_name,role,employee_id,active) values($1,$2,$3,$4,$5,$6)',[profile.id,profile.phone,profile.display_name,profile.role,profile.employee_id,profile.active]);
  }
  return db;
}
class DatabaseBackend {
  constructor(db) {this.db=db;this.sessions=new Map();this.loginPassword='test-only-generated';}
  async login(phone,password) {const profile=Object.values(profiles).find(p=>p.phone===phone);if(!profile||password!==this.loginPassword)fail(401,'Thông tin đăng nhập không hợp lệ.');const session='t'.repeat(32)+randomUUID().replaceAll('-','').slice(0,11);this.sessions.set(session,profile);return{session,profile};}
  async authenticate(session) {const p=this.sessions.get(session);if(!p)fail(401,'Phiên hết hạn.');return p;}
  async logout(session) {this.sessions.delete(session);}
  async snapshot(week) {return(await this.db.query('select workspace_snapshot($1) as data',[week])).rows[0].data;}
  async operation(actor,id) {return(await this.db.query('select fingerprint,result from audit_logs where actor=$1 and request_id=$2',[actor,id])).rows[0];}
  async commit(args) {try {return(await this.db.query('select commit_workspace($1,$2,$3,$4,$5,$6,$7,$8) as data',Object.values(args))).rows[0].data;}catch(error){if(error.code==='40001'||error.code==='23505')fail(409,'Dữ liệu đã thay đổi.');throw error;}}
  async accounts(){return Object.values(profiles);}
  async admin(){return{message:'Test adapter does not provision Supabase Auth users.'};}
}
async function invoke(handler,{method='GET',url='/api/auth',body,cookie,origin='http://localhost:4173',extra={}}={}) {
  const req={method,url,headers:{origin,'content-type':'application/json','x-2ce-request':'1',cookie,...extra},body,socket:{remoteAddress:'127.0.0.1'}};
  const result={headers:{}};const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},end(value){result.status=this.statusCode;result.data=JSON.parse(value);}};
  await handler(req,res);return result;
}
module.exports={database,DatabaseBackend,profiles,ids,invoke,employees,domain};
