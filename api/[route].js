'use strict';
const {createHandler}=require('../server/handler.cjs');
const {SupabaseBackend,config}=require('../server/supabase.cjs');
module.exports=async(req,res)=>{
  try {const settings=config();return await createHandler({backend:new SupabaseBackend(settings),origin:settings.origin})(req,res);}
  catch {res.setHeader('Cache-Control','no-store');res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Máy chủ chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên.',code:'CONFIGURATION'}));}
};
