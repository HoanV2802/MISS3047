'use strict';
const { DAYS, SHIFT_CONFIGS } = require('../shared/domain.js');
const { fail } = require('./validation.cjs');

function hasSubmitted(state, employeeId, shiftId) {
  return Object.hasOwn(state.registrations[employeeId]?.submittedShifts || {}, shiftId);
}
function submittedTotals(state, employeeId) {
  let hours = 0, evenings = 0;
  for (const id of Object.keys(state.registrations[employeeId]?.submittedShifts || {})) {
    const shift = state.shifts[id];
    const config = SHIFT_CONFIGS.find(c => c.key === shift?.shiftKey);
    if (config) { hours += config.duration; if (config.key === 'eve') evenings++; }
  }
  return { hours, evenings };
}
function submitDraft(state, employeeId, at) {
  const reg = state.registrations[employeeId];
  const previous = reg.submittedShifts || {};
  const submitted = {};
  for (const shift of Object.values(state.shifts)) {
    if (shift.registered.includes(employeeId) || reg.protectedShifts?.[shift.id]) {
      submitted[shift.id] = Object.hasOwn(previous, shift.id) ? previous[shift.id] : at;
    }
  }
  reg.submittedShifts = submitted;
  reg.isSubmitted = true;
  reg.needsConfirmation = false;
}

// Every assignment is planned on a clone by applyAction. Reserve approved slots
// across the entire week before comparing anyone's scheduled hours.
function generate(state, employees) {
  const people = new Map(employees.map(e => [e.id, e]));
  const hours = new Map(employees.map(e => [e.id, 0]));
  const allocations = new Map(Object.keys(state.shifts).map(id => [id, []]));
  for (const [id, reg] of Object.entries(state.registrations).sort(([a],[b]) => a.localeCompare(b))) {
    if (reg.needsConfirmation) fail(409, `Cần ${id} xác nhận lại đăng ký của tuần cũ trước khi xếp lại.`);
    const totals = submittedTotals(state, id);
    reg.isDisqualified = totals.hours < 20 || totals.evenings < 2;
    reg.reason = reg.isDisqualified ? 'Bản đã gửi chưa đủ 20 giờ và 2 ca tối' : '';
    for (const shiftId of Object.keys(reg.protectedShifts || {})) {
      const shift = state.shifts[shiftId], person = people.get(id);
      const config = SHIFT_CONFIGS.find(c => c.key === shift?.shiftKey);
      const seats = allocations.get(shiftId);
      const limit = config?.quotas[person?.dept]?.max || 0;
      if (!shift?.assigned.includes(id) || !hasSubmitted(state,id,shiftId) || !limit ||
          seats.filter(other => people.get(other).dept === person.dept).length >= limit) {
        fail(409, `Xung đột ca đã duyệt ${shiftId} của ${id}. Hãy đối soát phân công trước khi xếp lại.`);
      }
      seats.push(id);
      hours.set(id, hours.get(id) + config.duration);
    }
  }
  for (const day of DAYS) for (const key of ['eve','after','morn']) {
    const config = SHIFT_CONFIGS.find(c => c.key === key);
    const shiftId = day.key + '-' + key, seats = allocations.get(shiftId);
    const timestamp = id => state.registrations[id].submittedShifts[shiftId] ?? -Infinity;
    const candidates = employees.filter(e => !state.registrations[e.id].isDisqualified &&
      hasSubmitted(state,e.id,shiftId) && !seats.includes(e.id));
    candidates.sort((a,b) => {
      const x = hours.get(a.id), y = hours.get(b.id);
      if ((x < 20) !== (y < 20)) return x < 20 ? -1 : 1;
      if (x < 20 && x !== y) return x - y;
      return timestamp(a.id) - timestamp(b.id) || a.id.localeCompare(b.id);
    });
    for (const dept of config.allowedDepts) {
      const remaining = config.quotas[dept].max - seats.filter(id => people.get(id).dept === dept).length;
      for (const person of candidates.filter(e => e.dept === dept).slice(0, remaining)) {
        seats.push(person.id);
        hours.set(person.id, hours.get(person.id) + config.duration);
      }
    }
    state.shifts[shiftId].assigned = seats;
  }
}
module.exports = { generate, submitDraft, submittedTotals, hasSubmitted };
