'use strict';
const domain = require('../shared/domain.js');
const { hasSubmitted, submittedTotals } = require('./planning.cjs');
const { fail } = require('./validation.cjs');

function capacity(shift, dept, employees, assigned = shift.assigned) {
  const quota = domain.SHIFT_CONFIGS.find(c => c.key === shift.shiftKey)?.quotas[dept];
  return { max: quota?.max || 0, count: assigned.filter(id => employees.find(e => e.id === id)?.dept === dept).length };
}

// Called only on the server's cloned, revision-checked workspace. Commit remains atomic.
function approve(state, employees, req) {
  const rules = domain.engine(state, employees);
  const source = state.shifts[req.shiftId], person = employees.find(e => e.id === req.empId);
  const target = req.type === 'Xin đổi ca' ? state.shifts[req.targetShiftId] : null;
  const eligible = (e, shift, departingShift) => {
    const stats = submittedTotals(state,e.id);
    return hasSubmitted(state,e.id,shift.id) && rules.isDeptAllowed(e.dept, shift.shiftKey)
      && stats.hours >= 20 && stats.evenings >= 2
      && !shift.assigned.includes(e.id)
      && !state.changeRequests.some(r => r.id !== req.id && r.empId === e.id && (r.shiftId === shift.id || r.shiftId === departingShift) && r.status === 'CHỜ DUYỆT')
      // Preserve the replacement rule: free that day, except the shift being exchanged.
      && !Object.values(state.shifts).some(s => s.id !== departingShift && s.dayKey === shift.dayKey && s.assigned.includes(e.id));
  };
  if (target && !hasSubmitted(state,person.id,target.id)) fail(409, 'Nhân viên chưa đăng ký ca đích. Không thể duyệt đổi ca.');
  const requesterStats = submittedTotals(state,person.id);
  if (target && (requesterStats.hours < 20 || requesterStats.evenings < 2)) fail(409, 'Nhân viên chưa đủ 20 giờ đăng ký và 2 ca tối để đổi ca.');
  const partner = target && target.assigned.map(id => employees.find(e => e.id === id))
    .find(e => e && e.dept === person.dept && !state.registrations[e.id].protectedShifts?.[target.id] && eligible(e, source, target.id));
  const replacement = partner || employees.find(e => e.id !== person.id && e.dept === person.dept && eligible(e, source));
  const sourceAssigned = source.assigned.filter(id => id !== person.id);
  if (replacement) sourceAssigned.push(replacement.id);
  const targetAssigned = target ? [...target.assigned.filter(id => id !== partner?.id), person.id] : null;
  for (const [shift, assigned] of [[source, sourceAssigned], ...(target ? [[target, targetAssigned]] : [])]) {
    for (const dept of ['Bếp', 'Phục vụ', 'Pha chế']) {
      const c = capacity(shift, dept, employees, assigned);
      if (c.count > c.max) fail(409, `Ca ${shift.id} đã đạt giới hạn bộ phận ${dept}. Không thể duyệt yêu cầu.`);
    }
  }
  const registration = state.registrations[person.id];
  const released = registration.protectedShifts?.[source.id];
  delete registration.submittedShifts?.[source.id];
  if (released) {
    delete registration.protectedShifts[source.id];
    if (target) registration.protectedShifts[target.id] = req.id;
  }
  if (partner) delete state.registrations[partner.id].submittedShifts?.[target.id];
  source.assigned = sourceAssigned;
  source.registered = source.registered.filter(id => id !== person.id);
  if (target) {
    target.assigned = targetAssigned;
    if (partner) target.registered = target.registered.filter(id => id !== partner.id);
  }
  req.status = 'ĐÃ DUYỆT';
  const affected = [source, ...(target ? [target] : [])];
  const staffing = affected.map(s => ({ shiftId: s.id, ...rules.evaluateShiftStaffing(s) }));
  const message = [target ? 'Đã duyệt đổi ca.' : 'Đã duyệt đơn nghỉ.',
    partner ? `Đã đổi chéo với ${partner.id}, người đã đăng ký ca nguồn.` : replacement ? `Đã phân công ${replacement.id}, người đã đăng ký ca nguồn, thay thế.` : 'Chưa có người thay thế đủ điều kiện từ danh sách đăng ký.',
    ...staffing.map(s => `${s.shiftId}: ${s.isMet ? 'Đủ định biên tối thiểu.' : s.missingText + '. Cần quản lý xử lý ca thiếu.'}`)
  ].join('\n');
  return { message, reassignment: { replacementId: replacement?.id || null, mutualSwap: !!partner, releasedProtection: released || null, staffing } };
}
module.exports = { approve, capacity };
