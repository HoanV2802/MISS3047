'use strict';
const {createHmac}=require('node:crypto');
const {fail,phone}=require('./validation.cjs');
const DOMAIN='2ce-staging.invalid';
function demoConfig(env,url){
  const mode=env.TWOCE_AUTH_MODE||'phone';
  if(mode==='phone')return {authMode:mode};
  if(mode!=='staging-email'||env.TWOCE_ENV!=='staging'||env.TWOCE_STAGING_SUPABASE_URL!==url||env.VERCEL_ENV==='production')fail(503,'Chế độ đăng nhập demo chỉ được phép trên staging đã xác nhận.','CONFIGURATION');
  const key=Buffer.from(env.AUTH_MAPPING_KEY||'','base64');
  if(key.length!==32||key.toString('base64')!==env.AUTH_MAPPING_KEY)fail(503,'Thiếu khóa ánh xạ tài khoản staging hợp lệ.','CONFIGURATION');
  return {authMode:mode,authMappingKey:key};
}
function internalEmail(number,settings){
  if(settings?.authMode!=='staging-email'||!Buffer.isBuffer(settings.authMappingKey)||settings.authMappingKey.length!==32)fail(503,'Cấu hình ánh xạ staging không hợp lệ.','CONFIGURATION');
  return createHmac('sha256',settings.authMappingKey).update(phone(number)).digest('hex')+'@'+DOMAIN;
}
function identity(number,settings){return settings?.authMode==='staging-email'?{email:internalEmail(number,settings),email_confirm:true}:{phone:phone(number),phone_confirm:true};}
module.exports={demoConfig,internalEmail,identity};
