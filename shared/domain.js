/* Single source of scheduling rules. Browser uses read-only calculations;
 * the authenticated server is the only writer. Original scheduling/approval
 * functions below are retained verbatim, with UI effects captured as messages. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwoCE = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
const DAYS = [
  { key: 'mon', label: 'Thứ 2' },
  { key: 'tue', label: 'Thứ 3' },
  { key: 'wed', label: 'Thứ 4' },
  { key: 'thu', label: 'Thứ 5' },
  { key: 'fri', label: 'Thứ 6' },
  { key: 'sat', label: 'Thứ 7' },
  { key: 'sun', label: 'Chủ Nhật' }
];

const SHIFT_CONFIGS = [
  {
    key: 'morn',
    label: 'Ca Sáng',
    hours: '09:00 - 13:00',
    duration: 4, // 4 tiếng
    allowedDepts: ['Pha chế'], // Chỉ Pha chế
    quotas: { 'Bếp': 0, 'Phục vụ': 0, 'Pha chế': { min: 1, max: 1 } },
    summary: '1 Pha chế'
  },
  {
    key: 'after',
    label: 'Ca Chiều',
    hours: '13:00 - 17:00',
    duration: 4, // 4 tiếng
    allowedDepts: ['Bếp', 'Pha chế'], // Bếp và Pha chế
    quotas: { 'Bếp': { min: 1, max: 1 }, 'Phục vụ': 0, 'Pha chế': { min: 1, max: 2 } },
    summary: '1 Bếp, 1-2 Pha chế'
  },
  {
    key: 'eve',
    label: 'Ca Tối',
    hours: '17:00 - 23:00',
    duration: 6, // 6 tiếng
    allowedDepts: ['Bếp', 'Phục vụ', 'Pha chế'], // Cả 3 bộ phận
    quotas: { 'Bếp': { min: 2, max: 2 }, 'Phục vụ': { min: 2, max: 2 }, 'Pha chế': { min: 2, max: 3 } },
    summary: '2 Bếp, 2 Phục vụ, 2-3 Pha chế'
  }
];
function engine(appState, employees = []) {
  const EMPLOYEES = employees;
  const messages = [];
  const alert = message => messages.push(message);
  const renderAll = () => {};
function getEmployeeStats(empId) {
  let regHours = 0;
  let regEvening = 0;
  let assignedHours = 0;
  let assignedEvening = 0;

  Object.values(appState.shifts).forEach(shift => {
    const conf = SHIFT_CONFIGS.find(c => c.key === shift.shiftKey);
    if (shift.registered.includes(empId)) {
      regHours += conf.duration;
      if (shift.shiftKey === 'eve') regEvening++;
    }
    if (shift.assigned.includes(empId)) {
      assignedHours += conf.duration;
      if (shift.shiftKey === 'eve') assignedEvening++;
    }
  });

  // Giai đoạn đã xếp ca (weekStatus >= 2): Tính theo giờ thực tế được phân công (assignedHours)
  // Giai đoạn đang đăng ký (weekStatus == 1): Tính theo giờ đã chọn đăng ký (regHours)
  const isScheduledPhase = appState.weekStatus >= 2;
  const currentHours = isScheduledPhase ? assignedHours : regHours;
  const currentEvening = isScheduledPhase ? assignedEvening : regEvening;

  const isHoursValid = currentHours >= 20;
  const isEveningValid = currentEvening >= 2;
  const isValid = isHoursValid && isEveningValid;

  return {
    totalHours: currentHours,
    eveningCount: currentEvening,
    regHours,
    regEvening,
    assignedHours,
    assignedEvening,
    isHoursValid,
    isEveningValid,
    isValid
  };
}

function isDeptAllowed(dept, shiftKey) {
  const conf = SHIFT_CONFIGS.find(c => c.key === shiftKey);
  return conf ? conf.allowedDepts.includes(dept) : false;
}

function evaluateShiftStaffing(shift) {
  const conf = SHIFT_CONFIGS.find(c => c.key === shift.shiftKey);
  const assignedEmps = shift.assigned.map(id => EMPLOYEES.find(e => e.id === id)).filter(Boolean);

  const bepCount = assignedEmps.filter(e => e.dept === 'Bếp').length;
  const pvCount = assignedEmps.filter(e => e.dept === 'Phục vụ').length;
  const pcCount = assignedEmps.filter(e => e.dept === 'Pha chế').length;

  const missingDepts = [];

  if (shift.shiftKey === 'morn') {
    if (pcCount < 1) missingDepts.push('1 Pha chế');
  } else if (shift.shiftKey === 'after') {
    if (bepCount < 1) missingDepts.push('1 Bếp');
    if (pcCount < 1) missingDepts.push('1 Pha chế');
  } else if (shift.shiftKey === 'eve') {
    if (bepCount < 2) missingDepts.push(`${2 - bepCount} Bếp`);
    if (pvCount < 2) missingDepts.push(`${2 - pvCount} Phục vụ`);
    if (pcCount < 2) missingDepts.push(`${2 - pcCount} Pha chế`);
  }

  const isMet = missingDepts.length === 0;
  return {
    isMet,
    totalAssigned: assignedEmps.length,
    missingText: isMet ? '' : `Thiếu: ${missingDepts.join(', ')}`
  };
}

function runSchedulingAlgorithm() {
  Object.values(appState.shifts).forEach(s => {
    s.assigned = [];
  });

  // Bước 1: Kiểm tra Luật 1 của từng nhân viên
  EMPLOYEES.forEach(emp => {
    const stats = getEmployeeStats(emp.id);
    const reg = appState.registrations[emp.id];
    if (stats.regHours < 20 || stats.regEvening < 2) {
      reg.isDisqualified = true;
      reg.reason = `Chưa đủ 20h hoặc 2 ca tối`;
    } else {
      reg.isDisqualified = false;
      reg.reason = '';
    }
  });

  // Bước 2: Phân bổ nhân sự vào 21 ca
  const assignedHours = {};
  EMPLOYEES.forEach(e => { assignedHours[e.id] = 0; });

  const sortedShiftKeys = ['eve', 'after', 'morn'];

  DAYS.forEach(day => {
    sortedShiftKeys.forEach(sKey => {
      const shiftId = `${day.key}-${sKey}`;
      const shift = appState.shifts[shiftId];
      const conf = SHIFT_CONFIGS.find(c => c.key === sKey);

      const candidates = shift.registered
        .map(id => EMPLOYEES.find(e => e.id === id))
        .filter(emp => emp && !appState.registrations[emp.id].isDisqualified);

      candidates.sort((a, b) => assignedHours[a.id] - assignedHours[b.id]);

      // Tuyển Bếp
      if (conf.quotas['Bếp'] && conf.quotas['Bếp'] !== 0) {
        const quotaBep = conf.quotas['Bếp'].max || 1;
        const bepCandidates = candidates.filter(e => e.dept === 'Bếp');
        for (const bep of bepCandidates) {
          const count = shift.assigned.filter(id => EMPLOYEES.find(e => e.id === id).dept === 'Bếp').length;
          if (count < quotaBep && !shift.assigned.includes(bep.id)) {
            shift.assigned.push(bep.id);
            assignedHours[bep.id] += conf.duration;
          }
        }
      }

      // Tuyển Phục vụ
      if (conf.quotas['Phục vụ'] && conf.quotas['Phục vụ'] !== 0) {
        const quotaPV = conf.quotas['Phục vụ'].max || 2;
        const pvCandidates = candidates.filter(e => e.dept === 'Phục vụ');
        for (const pv of pvCandidates) {
          const count = shift.assigned.filter(id => EMPLOYEES.find(e => e.id === id).dept === 'Phục vụ').length;
          if (count < quotaPV && !shift.assigned.includes(pv.id)) {
            shift.assigned.push(pv.id);
            assignedHours[pv.id] += conf.duration;
          }
        }
      }

      // Tuyển Pha chế
      if (conf.quotas['Pha chế'] && conf.quotas['Pha chế'] !== 0) {
        const quotaPC = conf.quotas['Pha chế'].max || 1;
        const pcCandidates = candidates.filter(e => e.dept === 'Pha chế');
        for (const pc of pcCandidates) {
          const count = shift.assigned.filter(id => EMPLOYEES.find(e => e.id === id).dept === 'Pha chế').length;
          if (count < quotaPC && !shift.assigned.includes(pc.id)) {
            shift.assigned.push(pc.id);
            assignedHours[pc.id] += conf.duration;
          }
        }
      }
    });
  });
}

function approveChangeRequest(reqId) {
  const req = appState.changeRequests.find(r => r.id === reqId);
  if (!req) return;

  const oldShift = appState.shifts[req.shiftId];
  const oldEmp = EMPLOYEES.find(e => e.id === req.empId);
  const oldDay = DAYS.find(d => d.key === oldShift.dayKey);
  const oldConf = SHIFT_CONFIGS.find(c => c.key === oldShift.shiftKey);

  // 1. Trường hợp: XIN ĐỔI CA
  if (req.type === 'Xin đổi ca' && req.targetShiftId) {
    const targetShift = appState.shifts[req.targetShiftId];
    const targetDay = DAYS.find(d => d.key === targetShift.dayKey);
    const targetConf = SHIFT_CONFIGS.find(c => c.key === targetShift.shiftKey);

    // Gỡ nhân viên xin đổi ra khỏi ca cũ
    oldShift.assigned = oldShift.assigned.filter(id => id !== oldEmp.id);
    oldShift.registered = oldShift.registered.filter(id => id !== oldEmp.id);

    // Thêm nhân viên vào ca mới
    if (!targetShift.assigned.includes(oldEmp.id)) {
      targetShift.assigned.push(oldEmp.id);
      if (!targetShift.registered.includes(oldEmp.id)) {
        targetShift.registered.push(oldEmp.id);
      }
    }

    // Tìm xem ca mới có nhân viên nào cùng bộ phận có thể đổi chéo về ca cũ không
    const swapPartner = targetShift.assigned
      .map(id => EMPLOYEES.find(e => e.id === id))
      .find(e => e && e.dept === oldEmp.dept && e.id !== oldEmp.id);

    let replacementNote = '';
    if (swapPartner) {
      // Đổi chéo (Mutual swap) giữa 2 người
      targetShift.assigned = targetShift.assigned.filter(id => id !== swapPartner.id);
      targetShift.registered = targetShift.registered.filter(id => id !== swapPartner.id);

      oldShift.assigned.push(swapPartner.id);
      oldShift.registered.push(swapPartner.id);

      replacementNote = `\n- Đã đổi chéo thành công với ${swapPartner.name} (${swapPartner.id}): ${swapPartner.name} sẽ sang làm ca ${oldDay.label} - ${oldConf.label}. Cả 2 ca đều đủ người.`;
    } else {
      // Tìm 1 nhân sự rảnh cùng bộ phận thay thế vào ca cũ
      const substitute = EMPLOYEES.find(e => 
        e.dept === oldEmp.dept && 
        e.id !== oldEmp.id && 
        !oldShift.assigned.includes(e.id) &&
        !Object.values(appState.shifts).some(s => s.dayKey === oldShift.dayKey && s.assigned.includes(e.id))
      );

      if (substitute) {
        oldShift.assigned.push(substitute.id);
        oldShift.registered.push(substitute.id);
        replacementNote = `\n- Đã bố trí nhân viên thay thế ca cũ: ${substitute.name} (${substitute.id}).`;
      } else {
        replacementNote = `\n- ⚠️ CẢNH BÁO: Ca cũ (${oldDay.label} - ${oldConf.label}) hiện chưa có người thay thế và đang bị THIẾU 1 ${oldEmp.dept}!`;
      }
    }

    req.status = 'ĐÃ DUYỆT';
    oldShift.hasChangeReq = false;

    alert(`✅ ĐÃ PHÊ DUYỆT ĐỔI CA THÀNH CÔNG!\n- ${oldEmp.name} (${oldEmp.id}) chuyển từ ca [${oldDay.label} - ${oldConf.label}] sang ca [${targetDay.label} - ${targetConf.label}].${replacementNote}`);

  } 
  // 2. Trường hợp: XIN NGHỈ ĐỘT XUẤT
  else {
    oldShift.assigned = oldShift.assigned.filter(id => id !== oldEmp.id);
    oldShift.registered = oldShift.registered.filter(id => id !== oldEmp.id);

    // Tìm nhân sự cùng bộ phận chưa có ca vào ngày đó để thay thế
    const substitute = EMPLOYEES.find(e => 
      e.dept === oldEmp.dept && 
      e.id !== oldEmp.id && 
      !oldShift.assigned.includes(e.id) &&
      !Object.values(appState.shifts).some(s => s.dayKey === oldShift.dayKey && s.assigned.includes(e.id))
    );

    let subMsg = '';
    if (substitute) {
      oldShift.assigned.push(substitute.id);
      oldShift.registered.push(substitute.id);
      subMsg = `\n- Đã bố trí nhân viên thay thế: ${substitute.name} (${substitute.id}) - Bộ phận: ${substitute.dept}. Ca làm việc vẫn đủ người.`;
    } else {
      subMsg = `\n- ⚠️ CẢNH BÁO: Ca này hiện đang THIẾU 1 ${oldEmp.dept} do chưa tìm được người thay thế! Hệ thống đã ghi nhận ca thiếu để mở bổ sung.`;
    }

    req.status = 'ĐÃ DUYỆT';
    oldShift.hasChangeReq = false;

    alert(`✅ ĐÃ PHÊ DUYỆT ĐƠN NGHỈ ĐỘT XUẤT!\n- Nhân viên ${oldEmp.name} (${oldEmp.id}) được nghỉ ca ${oldDay.label} - ${oldConf.label}.${subMsg}`);
  }

  renderAll();
}

function rejectChangeRequest(reqId) {
  const req = appState.changeRequests.find(r => r.id === reqId);
  if (!req) return;

  req.status = 'TỪ CHỐI';
  const shift = appState.shifts[req.shiftId];
  if (shift) shift.hasChangeReq = false;

  alert('Đã từ chối đơn xin thay đổi ca. Giữ nguyên lịch làm việc của nhân viên.');
  renderAll();
}
  return { getEmployeeStats, isDeptAllowed, evaluateShiftStaffing, runSchedulingAlgorithm, approveChangeRequest, rejectChangeRequest, messages };
}
function emptyState(EMPLOYEES = []) {
  const shifts = Object.fromEntries(DAYS.flatMap(day => SHIFT_CONFIGS.map(conf => {
    const id = `${day.key}-${conf.key}`;
    return [id, { id, dayKey: day.key, shiftKey: conf.key, assigned: [], registered: [], hasChangeReq: false }];
  })));
  return { currentRole: null, weekStatus: 2, shifts, registrations: Object.fromEntries(EMPLOYEES.map(emp => [emp.id, { isSubmitted: false, isDisqualified: false, reason: '' }])), changeRequests: [] };
}
return { DAYS, SHIFT_CONFIGS, engine, emptyState };
});
