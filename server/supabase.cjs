'use strict';
const { createHash, randomBytes, createCipheriv, createDecipheriv, createHmac } = require('node:crypto');
const { AppError, fail } = require('./validation.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
function config(env = process.env) {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: legacyKey, SUPABASE_SECRET_KEY: modernKey, APP_ORIGIN: origin, SESSION_ENCRYPTION_KEY: encryptionKey } = env;
  const secretKey=modernKey||legacyKey;
  let parsed;
  try { parsed = new URL(url); } catch { fail(503, 'Máy chủ chưa được cấu hình Supabase.', 'CONFIGURATION'); }
  if (parsed.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(parsed.hostname)) fail(503, 'Cấu hình Supabase phải dùng HTTPS.');
  if (!publicKey || !secretKey || !origin || !encryptionKey || Buffer.from(encryptionKey,'base64').length !== 32) fail(503, 'Thiếu cấu hình xác thực của máy chủ.', 'CONFIGURATION');
  const app = new URL(origin);
  if (app.origin !== origin || (app.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(app.hostname))) fail(503, 'APP_ORIGIN phải là địa chỉ HTTPS chính xác (hoặc localhost).');
  return { url: parsed.origin, publicKey, secretKey, origin, key: Buffer.from(encryptionKey,'base64') };
}
function encrypt(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
}
function decrypt(value,key) {
  const data=Buffer.from(value,'base64'), decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
}
class SupabaseBackend {
  constructor(settings = config(), fetcher = fetch) { this.settings=settings; this.fetcher=fetcher; }
  async request(path, { method='GET', body, token, service=false, headers={} }={}) {
    const key=service?this.settings.secretKey:this.settings.publicKey;
    let response;
    try { response=await this.fetcher(this.settings.url+path,{method,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`} : {})),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)}); }
    catch { fail(503,'Không thể kết nối dịch vụ dữ liệu. Vui lòng thử lại.'); }
    const data=await response.json().catch(()=>null);
    if (!response.ok) {
      if(service && response.status===401) fail(503,'Cấu hình kết nối quản trị chưa hợp lệ.');
      if(path.startsWith('/auth/v1/admin/') && [400,422].includes(response.status)) fail(409,'Thông tin tài khoản không hợp lệ hoặc đã tồn tại.');
      if (response.status===401 || (path.startsWith('/auth/') && [400,422].includes(response.status))) fail(401,'Số điện thoại, mật khẩu hoặc phiên đăng nhập không hợp lệ.','UNAUTHENTICATED');
      if (response.status===429) fail(429,'Quá nhiều lần thử. Vui lòng đợi vài phút.');
      if (data?.code==='40001' || data?.code==='23505') fail(409,'Dữ liệu đã thay đổi hoặc thao tác đã tồn tại. Vui lòng tải lại.','CONFLICT');
      if (response.status===403 || data?.code==='42501') fail(403,'Bạn không có quyền thực hiện thao tác này.','FORBIDDEN');
      if (data?.code?.startsWith('23')) fail(422,'Dữ liệu không đáp ứng các ràng buộc lưu trữ.');
      fail(503,'Dịch vụ xác thực hoặc dữ liệu chưa sẵn sàng.');
    }
    return data;
  }
  rpc(name,body) { return this.request(`/rest/v1/rpc/${name}`,{method:'POST',body,service:true}); }
  async profile(userId) { return (await this.request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,{service:true}))[0]; }
  async rateLimit(phone,ip) {
    const key=value=>createHmac('sha256',this.settings.key).update(value).digest('hex');
    for (const [value,limit] of [[`ip:${ip}`,30],[`phone:${phone}`,10]]) if (!await this.rpc('consume_login_limit',{p_key:key(value),p_limit:limit})) fail(429,'Quá nhiều lần đăng nhập. Vui lòng đợi 5 phút.');
  }
  async login(phone,password,ip) {
    await this.rateLimit(phone,ip);
    const tokens=await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{phone,password}});
    const profile=await this.profile(tokens.user.id);
    if (!profile?.active) fail(403,'Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
    const session=randomBytes(32).toString('base64url');
    await this.request('/rest/v1/web_sessions',{method:'POST',service:true,body:{id:hash(session),user_id:profile.id,encrypted_tokens:encrypt(tokens,this.settings.key),expires_at:new Date(Date.now()+12*3600000).toISOString()}});
    return { session, profile };
  }
  async authenticate(session) {
    if (!session || !/^[\w-]{43}$/.test(session)) fail(401,'Vui lòng đăng nhập.','UNAUTHENTICATED');
    const id=hash(session);
    const rows=await this.request(`/rest/v1/web_sessions?id=eq.${id}&select=*`,{service:true});
    const row=rows[0];
    if (!row || Date.parse(row.expires_at)<=Date.now() || Date.parse(row.last_seen)<Date.now()-30*60000) {
      if(row) await this.logout(session);
      fail(401,'Phiên đã hết hạn. Vui lòng đăng nhập lại.','UNAUTHENTICATED');
    }
    let tokens;
    try { tokens=decrypt(row.encrypted_tokens,this.settings.key); } catch { await this.logout(session); fail(401,'Phiên không hợp lệ. Vui lòng đăng nhập lại.'); }
    let user;
    let refreshed = false;
    try { user=await this.request('/auth/v1/user',{token:tokens.access_token}); }
    catch(error) {
      if(error.status!==401) throw error;
      try { tokens=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:tokens.refresh_token}}); }
      catch(refreshError) { if(refreshError.status===401) await this.logout(session); throw refreshError; }
      refreshed = true;
      user=await this.request('/auth/v1/user',{token:tokens.access_token});
    }
    if(user.id!==row.user_id) { await this.logout(session); fail(401,'Phiên không hợp lệ.'); }
    const profile=await this.profile(user.id);
    if(!profile?.active) { await this.logout(session); fail(403,'Tài khoản đã bị khóa hoặc chưa được cấp quyền.'); }
    // Touching an already-valid session must not rewrite its old tokens or consume
    // the revision needed by another request that actually rotated those tokens.
    const changes={last_seen:new Date().toISOString()};
    if(refreshed) Object.assign(changes,{encrypted_tokens:encrypt(tokens,this.settings.key),revision:row.revision+1});
    const updated=await this.request(`/rest/v1/web_sessions?id=eq.${id}&revision=eq.${row.revision}`,{method:'PATCH',service:true,headers:{Prefer:'return=representation'},body:changes});
    if(!updated?.length) {
      const existing=await this.request(`/rest/v1/web_sessions?id=eq.${id}&select=id`,{service:true});
      if(!existing.length) fail(401,'Phiên đã kết thúc. Vui lòng đăng nhập lại.');
    }
    return profile;
  }
  async logout(session) {
    if(session && /^[\w-]{43}$/.test(session)) await this.request(`/rest/v1/web_sessions?id=eq.${hash(session)}`,{method:'DELETE',service:true});
    // Access/refresh tokens never leave the server; deleting the session immediately
    // invalidates this application's cookie even while Supabase JWTs remain valid.
  }
  snapshot(week) { return this.rpc('workspace_snapshot',{p_week:week}); }
  async operation(actor,requestId) { return (await this.request(`/rest/v1/audit_logs?actor=eq.${actor}&request_id=eq.${requestId}&select=fingerprint,result`,{service:true}))[0]; }
  commit(args) { return this.rpc('commit_workspace',args); }
  async accounts() { return this.request('/rest/v1/profiles?select=id,phone,display_name,role,employee_id,active,created_at&order=created_at.asc',{service:true}); }
  async admin(actor, payload) {
    const { exact,phone:normalize,uuid,text,fail }=require('./validation.cjs');
    exact(payload,['id','phone','displayName','role','employeeId','active','password','requestId']);
    uuid(payload.requestId);
    if(!['admin','manager','employee'].includes(payload.role) || typeof payload.active!=='boolean') fail(400,'Vai trò hoặc trạng thái tài khoản không hợp lệ.');
    const name=text(payload.displayName,120), number=normalize(payload.phone);
    const employee=payload.role==='employee'?payload.employeeId:null;
    if(payload.role==='employee' && !/^NV\d{2}$/.test(employee||'')) fail(400,'Mã nhân viên không hợp lệ.');
    let id=payload.id;if(id)uuid(id);
    if(employee) {const found=await this.request(`/rest/v1/employees?id=eq.${employee}&select=id`,{service:true});if(!found.length) fail(400,'Mã nhân viên chưa tồn tại.');}
    if(employee) {const assigned=await this.request(`/rest/v1/profiles?employee_id=eq.${employee}${id?'&id=neq.'+id:''}&select=id`,{service:true});if(assigned.length)fail(409,'Nhân viên đã được liên kết với tài khoản khác.');}
    if(id) {
      uuid(id);
      const current=await this.profile(id);
      if(!current || current.phone!==number || id===actor.id || payload.password) fail(400,'Không thể tự sửa quyền, sửa số điện thoại hoặc mật khẩu qua thao tác này.');
    } else {
      const taken=await this.request(`/rest/v1/profiles?phone=eq.${encodeURIComponent(number)}&select=id`,{service:true});
      if(taken.length) fail(409,'Số điện thoại đã có tài khoản.');
      if(typeof payload.password!=='string' || payload.password.length<12 || payload.password.length>128) fail(400,'Mật khẩu tài khoản mới cần 12–128 ký tự.');
      const created=await this.request('/auth/v1/admin/users',{method:'POST',service:true,body:{phone:number,password:payload.password,phone_confirm:true}});
      id=created.id;
    }
    await this.rpc('manage_profile',{p_actor:actor.id,p_target:id,p_phone:number,p_name:name,p_role:payload.role,p_employee:employee,p_active:payload.active,p_request:payload.requestId});
    return {message:'Đã lưu tài khoản.',id};
  }
}
module.exports={SupabaseBackend,config,encrypt,decrypt,hash};
