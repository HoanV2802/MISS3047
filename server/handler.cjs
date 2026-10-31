'use strict';
const { createHash }=require('node:crypto');
const { AppError, fail, phone, week, uuid, exact, permission }=require('./validation.cjs');
const { applyAction, visibleWorkspace, authorizeAction }=require('./workflows.cjs');
function headers(res, secure) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
  if(secure) res.setHeader('Strict-Transport-Security','max-age=31536000');
}
function cookie(res,value,secure,maxAge=43200) { res.setHeader('Set-Cookie',`${secure?'__Host-':''}2ce_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`); }
function sessionCookie(req,secure) {
  const name=`${secure?'__Host-':''}2ce_session`;
  return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
}
async function readBody(req) {
  if(Number(req.headers['content-length']||0)>16384) fail(413,'Dữ liệu gửi lên quá lớn.');
  if(req.body!==undefined) { if(Buffer.byteLength(JSON.stringify(req.body))>16384) fail(413,'Dữ liệu gửi lên quá lớn.'); try {return typeof req.body==='string'?JSON.parse(req.body):req.body;} catch {fail(400,'Dữ liệu JSON không hợp lệ.');} }
  let body=''; for await (const chunk of req) { body+=chunk; if(Buffer.byteLength(body)>16384) fail(413,'Dữ liệu gửi lên quá lớn.'); }
  try { return JSON.parse(body); } catch { fail(400,'Dữ liệu JSON không hợp lệ.'); }
}
function createHandler({backend,origin}) {
  const secure=origin.startsWith('https:');
  return async function handler(req,res) {
    headers(res,secure);
    const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      const path=new URL(req.url,origin).pathname;
      if(!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');fail(405,'Phương thức không được hỗ trợ.');}
      if(req.method==='POST' && (req.headers.origin!==origin || req.headers['x-2ce-request']!=='1' || !req.headers['content-type']?.startsWith('application/json') || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])))) fail(403,'Yêu cầu không đến từ trang ứng dụng.','CSRF');
      const session=sessionCookie(req,secure);
      if(path==='/api/auth' && req.method==='POST') {
        const body=await readBody(req); exact(body,['action','phone','password']);
        if(body.action==='logout') { await backend.logout(session); cookie(res,'',secure,0); return send(200,{message:'Đã đăng xuất.'}); }
        if(body.action!=='login' || typeof body.password!=='string' || !body.password || body.password.length>128) fail(400,'Nhập số điện thoại và mật khẩu hợp lệ.');
        const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'').split(',')[0]:req.socket?.remoteAddress||'local';
        const result=await backend.login(phone(body.phone),body.password,ip);
        cookie(res,result.session,secure); return send(200,{profile:result.profile});
      }
      const profile=await backend.authenticate(session);
      if(path==='/api/auth' && req.method==='GET') return send(200,{profile});
      if(path==='/api/workspace' && req.method==='GET') {
        permission(profile,['manager','employee']);
        const selected=week(new URL(req.url,origin).searchParams.get('week'));
        return send(200,visibleWorkspace(await backend.snapshot(selected),profile));
      }
      if(path==='/api/action' && req.method==='POST') {
        const body=await readBody(req); exact(body,['week','revision','requestId','action','payload']);
        week(body.week); uuid(body.requestId);
        if(!Number.isInteger(body.revision)||body.revision<0) fail(400,'Phiên bản dữ liệu không hợp lệ.');
        authorizeAction(profile,body.action);
        const fingerprint=createHash('sha256').update(JSON.stringify([body.week,body.revision,body.action,body.payload])).digest('hex');
        const prior=await backend.operation(profile.id,body.requestId);
        if(prior) { if(prior.fingerprint!==fingerprint) fail(409,'Mã yêu cầu đã được dùng cho thao tác khác.'); return send(200,prior.result); }
        const snapshot=await backend.snapshot(body.week);
        if(snapshot.revision!==body.revision) fail(409,'Lịch đã thay đổi. Vui lòng tải lại trước khi tiếp tục.','CONFLICT');
        const {state,result}=applyAction(snapshot,profile,body.action,body.payload,body.requestId);
        await backend.commit({p_actor:profile.id,p_action:body.action,p_request:body.requestId,p_week:body.week,p_revision:body.revision,p_fingerprint:fingerprint,p_state:state,p_result:result});
        return send(200,result);
      }
      if(path==='/api/admin') {
        permission(profile,['admin']);
        if(req.method==='GET') return send(200,{accounts:await backend.accounts()});
        return send(200,await backend.admin(profile,await readBody(req)));
      }
      fail(404,'Không tìm thấy chức năng.');
    } catch(error) {
      const known=error instanceof AppError;
      if(error.status===401) cookie(res,'',secure,0);
      // Never return Supabase payloads, stack traces, secrets or raw database errors.
      send(known?error.status:500,{error:known?error.message:'Có lỗi máy chủ. Vui lòng thử lại.',code:known?error.code:'INTERNAL'});
    }
  };
}
module.exports={createHandler,readBody,sessionCookie};
