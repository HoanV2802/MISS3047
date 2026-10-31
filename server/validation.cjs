'use strict';
class AppError extends Error {
  constructor(status, message, code = 'INVALID') { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new AppError(status, message, code); };
function phone(value) {
  if (typeof value !== 'string' || !/^[+\d\s().-]{8,30}$/.test(value)) fail(400, 'Số điện thoại không hợp lệ.');
  let normalized = value.replace(/[\s().-]/g, '');
  if (normalized.startsWith('00')) normalized = '+' + normalized.slice(2);
  if (/^0\d{9}$/.test(normalized)) normalized = '+84' + normalized.slice(1);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) fail(400, 'Nhập số Việt Nam hoặc số quốc tế có mã quốc gia.');
  return normalized;
}
function week(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Ngày bắt đầu tuần không hợp lệ.');
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value || d.getUTCDay() !== 1 || d.getUTCFullYear() < 2020 || d.getUTCFullYear() > 2100) fail(400, 'Tuần phải bắt đầu vào thứ Hai (2020–2100).');
  return value;
}
function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(400, 'Mã yêu cầu không hợp lệ.'); return value; }
function text(value, max = 1000) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(400, 'Nội dung không hợp lệ hoặc quá dài.'); return value.trim(); }
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'Dữ liệu gửi lên không hợp lệ.'); }
function permission(profile, roles) { if (!profile?.active || !roles.includes(profile.role)) fail(403, 'Bạn không có quyền thực hiện thao tác này.', 'FORBIDDEN'); }
module.exports = { AppError, fail, phone, week, uuid, text, exact, permission };
