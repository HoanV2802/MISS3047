'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {phone,text,uuid}=require('../server/validation.cjs');
const employees=require('../server/employees.cjs');
function validateManifest(records){
 if(!Array.isArray(records)||records.length!==employees.length+2)throw new Error('Manifest must contain one admin, one manager and all 18 employees.');
 if(records.filter(r=>r?.role==='admin').length!==1||records.filter(r=>r?.role==='manager').length!==1||employees.some(e=>records.filter(r=>r?.role==='employee'&&r.employeeId===e.id).length!==1))throw new Error('Invalid role/employee mapping.');
 const normalized=records.map(record=>{
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).some(k=>!['role','phone','employeeId','displayName'].includes(k)))throw new Error('Unknown manifest field; passwords must not be stored in the manifest.');
  if(record.role!=='employee'&&record.employeeId!=null)throw new Error('Admin/manager accounts must not have an employee ID.');
  return {...record,phone:phone(record.phone),...(record.displayName!==undefined?{displayName:text(record.displayName,120)}:{})};
 });
 if(new Set(normalized.map(r=>r.phone)).size!==normalized.length)throw new Error('Duplicate phone numbers.');
 return normalized;
}
function checkExisting(records,profiles,users,bootstrap,settings){
 const activeAdmin=profiles.find(p=>p.role==='admin'&&p.active);
 if(!activeAdmin&&profiles.some(p=>p.role==='admin'))throw new Error('No active administrator. Recover the existing admin before provisioning.');
 if(!activeAdmin&&!bootstrap)throw new Error('Fresh project requires explicit --bootstrap.');
 for(const record of records){
  const existing=profiles.find(p=>p.phone===record.phone);
  const emailMode=settings?.authMode==='staging-email';
  if(emailMode&&users.some(u=>u.phone===record.phone||'+'+u.phone===record.phone))throw new Error('Legacy phone identity exists. Review migration explicitly; no identity was replaced.');
  const email=emailMode?require('../server/demo-auth.cjs').internalEmail(record.phone,settings):null;
  const auth=users.find(u=>emailMode?u.email===email:(u.phone===record.phone||'+'+u.phone===record.phone));
  if(existing){
   if(existing.role!==record.role||existing.employee_id!==(record.employeeId||null)||!existing.active)throw new Error('Existing account mapping/status differs; review it in Admin first.');
   if(!auth||auth.id!==existing.id)throw new Error('Auth identity does not match its application profile. Recover it before retrying.');
   if(emailMode&&!auth.email_confirmed_at)throw new Error('Staging Auth identity is not confirmed. Review it before retrying.');
  }else if(auth)throw new Error('Auth account exists without matching profile. Recover it using docs/OPERATIONS.md; no password was reset.');
  if(record.employeeId&&profiles.some(p=>p.employee_id===record.employeeId&&p.phone!==record.phone))throw new Error('Employee is already linked to another phone number.');
 }
 return activeAdmin;
}
function validateEmployees(rows){
 if(!Array.isArray(rows)||rows.length!==employees.length||employees.some(e=>rows.filter(r=>r?.id===e.id).length!==1))throw new Error('Database employee IDs do not match the demo manifest. No accounts were created.');
}
function validateCreatedUser(user,expected,users,profiles){
 try{uuid(user?.id);}catch{throw new Error('Invalid Auth creation response. Keep the credential file and review Auth before retrying.');}
 const matches=expected.email?user.email===expected.email&&user.email_confirmed_at:(user.phone===expected.phone||'+'+user.phone===expected.phone)&&user.phone_confirmed_at;
 if(!matches||users.some(u=>u.id===user.id)||profiles.some(p=>p.id===user.id))throw new Error('Auth creation identity mismatch. No profile was written; keep the credential file for recovery.');
}
async function credentialWriter(output,{root,io=fs}={}){
 const parent=await io.realpath(path.dirname(path.resolve(output)));
 const destination=path.join(parent,path.basename(output));
 const canonicalRoot=await io.realpath(root);
 if(destination===canonicalRoot||destination.startsWith(canonicalRoot+path.sep))throw new Error('Credential output must be outside the repository, including symlinked paths.');
 const reservation=await io.open(destination,'wx',0o600);
 let initialized=false;
 try{await reservation.writeFile('[]\n');await reservation.sync();initialized=true;}
 finally{try{await reservation.close();}finally{if(!initialized)await io.rm(destination,{force:true});}}
 return {destination,async save(records){
  const temp=path.join(parent,`.${path.basename(destination)}.${randomUUID()}.tmp`);
  let handle,owned=false;
  try{
   handle=await io.open(temp,'wx',0o600);owned=true;await handle.writeFile(JSON.stringify(records,null,2)+'\n');await handle.sync();await handle.close();handle=null;
   // Atomic replacement preserves the previous complete credential file on failure.
   await io.rename(temp,destination);
   if(process.platform!=='win32'){const directory=await io.open(parent,'r');try{await directory.sync();}finally{await directory.close();}}
  }finally{try{if(handle)await handle.close();}finally{if(owned)await io.rm(temp,{force:true});}}
 }};
}
module.exports={validateManifest,checkExisting,validateEmployees,validateCreatedUser,credentialWriter};
