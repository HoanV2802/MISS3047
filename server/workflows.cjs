'use strict';
const { randomUUID } = require('node:crypto');
const domain = require('../shared/domain.js');
const {generate, submitDraft, hasSubmitted} = require('./planning.cjs');
const { approve, capacity } = require('./approvals.cjs');
const { fail, exact, permission, text, uuid } = require('./validation.cjs');
const actions = {
  phase: ['status', 'acceptMissing'], generate: [], registration: ['shiftId', 'selected'],
  submit: ['shiftIds'], withdraw: ['requestId'], request: ['shiftId', 'type', 'targetShiftId', 'reason'], approve: ['requestId'], reject: ['requestId']
};
const supplementType = 'Đăng ký bổ sung';
function supplementIssue(shift, person, employees, rules) {
  if (!rules.isDeptAllowed(person.dept, shift.shiftKey)) return 'Ca này không tuyển bộ phận của bạn.';
  if (shift.assigned.includes(person.id)) return 'Nhân viên đã đăng ký hoặc đã được xếp ca này.';
  const slots = capacity(shift, person.dept, employees);
  if (slots.count >= slots.max) return `Ca này đã đủ người cho bộ phận ${person.dept}.`;
  if (rules.evaluateShiftStaffing(shift).isMet) return 'Ca này đã đủ nhân sự.';
  return '';
}
function authorizeAction(profile,action) {
  if (!Object.hasOwn(actions, action)) fail(400, 'Thao tác không hợp lệ.');
  permission(profile, ['phase','generate','approve','reject'].includes(action) ? ['manager'] : ['employee']);
}
function applyAction(snapshot, profile, action, payload, requestId, now = new Date()) {
  if (!Object.hasOwn(actions, action)) fail(400, 'Thao tác không hợp lệ.');
  exact(payload, actions[action]);
  authorizeAction(profile,action);
  const state = structuredClone(snapshot.state);
  const employees = snapshot.employees;
  const emp = employees.find(e => e.id === profile.employee_id);
  if (profile.role === 'employee' && !emp) fail(403, 'Tài khoản chưa được liên kết với nhân viên.');
  const rules = domain.engine(state, employees);
  if (['registration','request'].includes(action) && (typeof payload.shiftId!=='string' || !Object.hasOwn(state.shifts,payload.shiftId))) fail(400,'Ca làm không hợp lệ.');
  const shift = payload.shiftId ? state.shifts[payload.shiftId] : null;
  if (payload.shiftId && !shift) fail(400, 'Ca làm không tồn tại.');
  const pending = state.changeRequests.some(r => r.status === 'CHỜ DUYỆT');
  let result = { message: 'Đã lưu thay đổi.' };
  switch (action) {
    case 'phase': {
      if (!Number.isInteger(payload.status) || payload.status < 1 || payload.status > 4 || (payload.acceptMissing !== undefined && typeof payload.acceptMissing !== 'boolean')) fail(400, 'Bước quy trình không hợp lệ.');
      if (payload.status === state.weekStatus) fail(409, 'Quy trình đã ở bước này.');
      // Original workflow allows reopening any of the four valid steps.
      if (payload.status === 4 && Object.values(state.shifts).some(s => !rules.evaluateShiftStaffing(s).isMet) && payload.acceptMissing !== true) fail(409, 'Cần xác nhận chấp nhận ca thiếu trước khi phát hành.', 'CONFIRM_MISSING');
      state.weekStatus = payload.status;
      break;
    }
    case 'generate':
      if (state.weekStatus === 4 || pending) fail(409, 'Mở lại quy trình và xử lý đơn chờ duyệt trước khi xếp lại ca.');
      generate(state, employees);
      state.weekStatus = Object.values(state.shifts).every(s => rules.evaluateShiftStaffing(s).isMet) ? 4 : 3;
      result.message = state.weekStatus === 4 ? 'Đã xếp ca và phát hành lịch đủ định biên.' : 'Đã xếp ca. Một số ca còn thiếu người; đã mở đăng ký bổ sung.';
      break;
    case 'registration': {
      if (typeof payload.selected !== 'boolean') fail(400, 'Trạng thái chọn ca không hợp lệ.');
      if (state.weekStatus !== 1) fail(409, 'Cổng đăng ký tuần đã đóng. Vui lòng gửi đơn bổ sung để quản lý duyệt.');
      if (!rules.isDeptAllowed(emp.dept, shift.shiftKey)) fail(403, 'Ca này không tuyển bộ phận của bạn.');
      const registered = shift.registered.includes(emp.id);
      if (registered === payload.selected) fail(409, 'Đăng ký này đã tồn tại hoặc đã được hủy.');
      const registration = state.registrations[emp.id];
      if (registration.protectedShifts?.[shift.id]) fail(409,'Ca đã duyệt được giữ chỗ. Hãy gửi yêu cầu nghỉ/đổi khi lịch phát hành.');
      registration.isSubmitted = false;
      shift.registered = payload.selected ? [...shift.registered, emp.id] : shift.registered.filter(id => id !== emp.id);
      break;
    }
    case 'withdraw': {
      uuid(payload.requestId);
      const req = state.changeRequests.find(r => r.id === payload.requestId && r.empId === emp.id && r.type === supplementType);
      if (!req) fail(404, 'Không tìm thấy đơn bổ sung của bạn.');
      if (req.status !== 'CHỜ DUYỆT') fail(409, 'Chỉ có thể rút đơn đang chờ duyệt.');
      req.status = 'ĐÃ RÚT';
      result.message = 'Đã rút đơn bổ sung.';
      break;
    }
    case 'submit':
      if (Object.hasOwn(payload, 'shiftIds')) {
        if (state.weekStatus !== 3) fail(409, 'Đợt đăng ký bổ sung đã đóng.');
        const ids = payload.shiftIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > Object.keys(state.shifts).length || new Set(ids).size !== ids.length) fail(400, 'Danh sách ca bổ sung không hợp lệ.');
        for (const id of ids) {
          if (typeof id !== 'string' || !Object.hasOwn(state.shifts, id)) fail(400, 'Ca làm không hợp lệ.');
          if (hasSubmitted(state,emp.id,id)) fail(409,'Bạn đã gửi đăng ký cho ca này.');
          const issue = supplementIssue(state.shifts[id], emp, employees, rules);
          if (issue) fail(409, issue);
          if (state.changeRequests.some(r => r.empId === emp.id && r.shiftId === id && r.status === 'CHỜ DUYỆT')) fail(409, 'Bạn đã có đơn chờ duyệt cho ca này.');
          state.changeRequests.unshift({ id:randomUUID(), empId:emp.id, shiftId:id, targetShiftId:null, type:supplementType, reason:'Đăng ký nhận ca còn thiếu người.', status:'CHỜ DUYỆT', time:now.toISOString() });
          state.shifts[id].hasChangeReq = true;
        }
        result.message = `Đã gửi ${ids.length} ca bổ sung. Đang chờ quản lý duyệt.`;
        break;
      }
      if (state.weekStatus !== 1) fail(409, 'Cổng đăng ký hiện đang đóng.');
      if (!rules.getEmployeeStats(emp.id).isValid) fail(422, 'Cần ít nhất 20 giờ và 2 ca tối để gửi đăng ký.');
      submitDraft(state, emp.id, now.getTime());
      result.message = 'Đã gửi đăng ký ca làm.';
      break;
    case 'request': {
      if (state.weekStatus !== 4 || !shift.assigned.includes(emp.id)) fail(403, 'Chỉ được gửi đơn cho ca được phân công trong lịch đã phát hành.');
      if (state.changeRequests.some(r => r.empId === emp.id && r.shiftId === shift.id && r.status === 'CHỜ DUYỆT')) fail(409, 'Ca này đã có đơn chờ duyệt.');
      if (!['leave','swap'].includes(payload.type)) fail(400, 'Loại đơn không hợp lệ.');
      const reason = text(payload.reason);
      const target = state.shifts[payload.targetShiftId];
      if (payload.type === 'swap' && target && !hasSubmitted(state,emp.id,target.id)) fail(422,'Bạn chưa gửi đăng ký ca đích.');
      if (payload.type === 'swap' && (!target || target.id === shift.id || !rules.isDeptAllowed(emp.dept, target.shiftKey) || target.assigned.includes(emp.id))) fail(422, 'Ca muốn đổi sang không phù hợp.');
      if (payload.type === 'leave' && payload.targetShiftId) fail(400, 'Đơn nghỉ không được kèm ca đổi.');
      state.changeRequests.unshift({ id: uuid(requestId), empId: emp.id, shiftId: shift.id, targetShiftId: payload.type === 'swap' ? target.id : null, type: payload.type === 'swap' ? 'Xin đổi ca' : 'Xin nghỉ đột xuất', reason, status: 'CHỜ DUYỆT', time: now.toISOString() });
      shift.hasChangeReq = true;
      result.message = 'Đã gửi yêu cầu cho quản lý.';
      break;
    }
    case 'approve': case 'reject': {
      uuid(payload.requestId);
      const req = state.changeRequests.find(r => r.id === payload.requestId);
      if (!req) fail(404, 'Không tìm thấy đơn.');
      if (req.type === supplementType) {
        if (req.status !== 'CHỜ DUYỆT') fail(409, 'Đơn đã được xử lý hoặc nhân viên đã rút.');
        if (action === 'approve') {
          if (state.weekStatus !== 3) fail(409, 'Chỉ có thể duyệt nhận ca trong đợt bổ sung.');
          const person = employees.find(e => e.id === req.empId);
          const source = state.shifts[req.shiftId];
          if (hasSubmitted(state,person.id,source.id)) fail(409,'Nhân viên đã gửi đăng ký ca này.');
          const issue = supplementIssue(source, person, employees, rules);
          if (issue) fail(409, issue);
          const reg = state.registrations[person.id];
          (reg.submittedShifts ||= {})[source.id] = Date.parse(req.time);
          (reg.protectedShifts ||= {})[source.id] = req.id;
          if (!source.registered.includes(person.id)) source.registered.push(person.id);
          source.assigned.push(person.id);
        }
        req.status = action === 'approve' ? 'ĐÃ DUYỆT' : 'TỪ CHỐI';
        result.message = action === 'approve' ? 'Đã duyệt và thêm ca vào lịch của nhân viên.' : 'Đã từ chối đơn bổ sung.';
        break;
      }
      if (state.weekStatus !== 4 || req.status !== 'CHỜ DUYỆT') fail(409, 'Đơn không còn ở trạng thái có thể xét duyệt.');
      if (!state.shifts[req.shiftId].assigned.includes(req.empId)) fail(409, 'Phân công đã thay đổi. Vui lòng kiểm tra lại.');
      const person = employees.find(e => e.id === req.empId);
      const target = state.shifts[req.targetShiftId];
      if (action === 'approve' && req.type === 'Xin đổi ca' && (!target || !rules.isDeptAllowed(person.dept, target.shiftKey) || target.assigned.includes(person.id))) fail(409, 'Ca đích đã thay đổi, không thể duyệt đơn này.');
      if (action === 'approve') result = approve(state, employees, req);
      else { rules.rejectChangeRequest(req.id); result.message = rules.messages.at(-1); }
      // Derive pending state rather than losing another employee's pending request.

      break;
    }
  }
  if (['approve','reject','withdraw'].includes(action)) {
    for (const shift of Object.values(state.shifts)) shift.hasChangeReq = state.changeRequests.some(r => r.shiftId === shift.id && r.status === 'CHỜ DUYỆT');
  }
  result.details={fromPhase:snapshot.state.weekStatus,toPhase:state.weekStatus};
  for(const key of ['shiftId','shiftIds','selected','requestId','status','type','targetShiftId','acceptMissing']) if(Object.hasOwn(payload,key)) result.details[key]=payload[key];
  if(action==='request') result.details.requestId=requestId;
  if(action==='generate') result.details.staffedShifts=Object.values(state.shifts).filter(s=>rules.evaluateShiftStaffing(s).isMet).length;
  return { state, result };
}
function visibleWorkspace(snapshot, profile) {
  permission(profile, ['manager','employee']);
  const state = structuredClone(snapshot.state);
  const staffing = Object.fromEntries(Object.values(state.shifts).map(shift => [shift.id, domain.engine(state, snapshot.employees).evaluateShiftStaffing(shift)]));
  if (profile.role === 'employee') {
    const person = snapshot.employees.find(e => e.id === profile.employee_id);
    const rules = domain.engine(state, snapshot.employees);
    for (const shift of Object.values(state.shifts)) {
      staffing[shift.id].canSupplement = !!person && state.weekStatus === 3 && !hasSubmitted(state,person.id,shift.id) && !supplementIssue(shift, person, snapshot.employees, rules);
      shift.registered = shift.registered.filter(id => id === profile.employee_id);
      shift.assigned = shift.assigned.filter(id => id === profile.employee_id);
    }
    state.registrations = { [profile.employee_id]: state.registrations[profile.employee_id] };
    state.changeRequests = state.changeRequests.filter(r => r.empId === profile.employee_id);
  }
  state.currentRole = profile.role === 'manager' ? 'quanly' : profile.employee_id;
  return { ...snapshot, state, staffing, employees: profile.role === 'manager' ? snapshot.employees : snapshot.employees.filter(e => e.id === profile.employee_id) };
}
module.exports = { applyAction, visibleWorkspace, actions, authorizeAction };
