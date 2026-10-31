/**
 * ============================================================================
 * HỆ THỐNG XẾP LỊCH CA LÀM VIỆC NỘI BỘ - QUÁN CAFE 2CE
 * GIAO DIỆN THỰC TẾ - THAY ĐỔI THEO THỜI GIAN THỰC CỦA TUẦN
 * Xác thực và dữ liệu được tải từ API; không có mật khẩu mặc định.
 * ============================================================================
 */

// ============================================================================
// 1. DỮ LIỆU CỐ ĐỊNH: 18 NHÂN VIÊN PART-TIME & 3 BỘ PHẬN
// ============================================================================

let EMPLOYEES = [];
const { DAYS, SHIFT_CONFIGS } = TwoCE;
// ============================================================================
// 2. QUẢN LÝ THỜI GIAN THỰC TẾ CỦA TUẦN (DYNAMIC WEEK CALCULATION)
// ============================================================================

// Độ lệch tuần so với hiện tại (0: tuần hiện tại, 1: tuần sau, -1: tuần trước)
let currentWeekOffset = 0;

/**
 * Lấy ngày Thứ 2 đầu tuần của một ngày bất kỳ
 */
function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  // Nếu là Chủ Nhật (day = 0) thì lui về Thứ 2 của tuần trước (-6 ngày)
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Lấy danh sách 7 ngày (từ Thứ 2 đến Chủ Nhật) theo weekOffset
 */
function getWeekDates(offset = 0) {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + offset * 7);
  const monday = getMondayOfWeek(baseDate);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * Định dạng ngày theo chuẩn Việt Nam: DD/MM/YYYY
 */
function formatDateDMY(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Định dạng ngày ngắn gọn: DD/MM
 */
function formatDateDM(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Chuỗi hiển thị khoảng thời gian tuần: "Từ ngày DD/MM/YYYY đến ngày DD/MM/YYYY"
 */
function getWeekRangeText(offset = currentWeekOffset) {
  const dates = getWeekDates(offset);
  const startStr = formatDateDMY(dates[0]);
  const endStr = formatDateDMY(dates[6]);
  return `Từ ngày ${startStr} đến ngày ${endStr}`;
}

/**
 * Chuyển tuần (+1 hoặc -1)
 */
function changeWeek(delta) {
  currentWeekOffset += delta;
  refreshWorkspace();
}

/**
 * Quay về tuần hiện tại
 */
function resetCurrentWeek() {
  currentWeekOffset = 0;
  refreshWorkspace();
}

/**
 * Chọn một ngày cụ thể trên lịch date picker để nhảy tới tuần đó
 */
function onDatePicked(dateStr) {
  if (!dateStr) return;
  const pickedDate = new Date(dateStr);
  const currentMonday = getMondayOfWeek(new Date());
  const pickedMonday = getMondayOfWeek(pickedDate);

  const diffTime = pickedMonday.getTime() - currentMonday.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  currentWeekOffset = Math.round(diffDays / 7);
  refreshWorkspace();
}

// ============================================================================
// 3. TRẠNG THÁI TOÀN CỤC CỦA HỆ THỐNG (APP STATE)
// ============================================================================

const appState = {
  // View-model identifier only; authorization is enforced by the server.
  currentRole: null,

  // Tiến trình tuần: 1: Mở đăng ký | 2: Chốt & Xếp ca | 3: Bổ sung | 4: Phát hành chính thức
  weekStatus: 2,

  // 21 ca làm việc trong tuần (7 ngày x 3 ca)
  shifts: {},

  // Dữ liệu đăng ký ca của từng nhân viên
  registrations: {},

  // Danh sách đơn xin đổi ca / nghỉ đột xuất trong tuần
  changeRequests: []
};

// ============================================================================
// 4. KHỞI TẠO DỮ LIỆU BAN ĐẦU & SEED LỊCH THỰC TẾ
// ============================================================================

function getEmployeeStats(empId) { return TwoCE.engine(appState, EMPLOYEES).getEmployeeStats(empId); }
function isDeptAllowed(dept, shiftKey) { return TwoCE.engine(appState, EMPLOYEES).isDeptAllowed(dept, shiftKey); }
function evaluateShiftStaffing(shift) { return serverStaffing[shift.id] || TwoCE.engine(appState, EMPLOYEES).evaluateShiftStaffing(shift); }

function switchView(viewName) {
  document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active-view'));
  document.getElementById({ login:'viewLogin', manager:'viewManager', employee:'viewEmployee', admin:'viewAdmin' }[viewName]).classList.add('active-view');
}

function onChangeTypeToggle(val) {
  const box = document.getElementById('swapTargetShiftBox');
  if (box) {
    box.style.display = (val === 'swap') ? 'block' : 'none';
  }
}

/**
 * Mở modal xin đổi ca / nghỉ đột xuất
 */
function openChangeModal(shiftId) {
  const shift = appState.shifts[shiftId];
  const day = DAYS.find(d => d.key === shift.dayKey);
  const conf = SHIFT_CONFIGS.find(c => c.key === shift.shiftKey);
  const dates = getWeekDates(currentWeekOffset);
  const dayIndex = DAYS.findIndex(d => d.key === shift.dayKey);
  const dateStr = formatDateDM(dates[dayIndex]);
  const emp = EMPLOYEES.find(e => e.id === appState.currentRole);

  document.getElementById('changeShiftIdHidden').value = shiftId;
  document.getElementById('changeShiftInfoText').innerText = `${day.label} (${dateStr}) • ${conf.label} (${conf.hours})`;
  document.getElementById('changeReasonInput').value = '';
  document.getElementById('changeRequestError').hidden=true;

  // Đặt lại radio về 'leave'
  const radioLeave = document.querySelector('input[name="changeTypeRadio"][value="leave"]');
  if (radioLeave) radioLeave.checked = true;
  onChangeTypeToggle('leave');

  // Đổ danh sách các ca mà nhân viên CÓ THỂ ĐỔI VÀO
  const targetSelect = document.getElementById('targetShiftSelect');
  if (targetSelect && emp) {
    targetSelect.innerHTML = '';
    const availableOptions = [];

    DAYS.forEach((d, dIdx) => {
      SHIFT_CONFIGS.forEach(c => {
        const sId = `${d.key}-${c.key}`;
        // Không hiện ca hiện tại đang xin đổi
        if (sId === shiftId) return;

        // Phải đúng bộ phận của nhân viên
        if (!isDeptAllowed(emp.dept, c.key)) return;

        // Nhân viên chưa được xếp vào ca này
        const targetShift = appState.shifts[sId];
        if (targetShift.assigned.includes(emp.id)) return;

        const dStr = formatDateDM(dates[dIdx]);
        const count = serverStaffing[sId]?.totalAssigned || 0;
        const currentInShift = count ? `${count} nhân viên` : '';
        const infoNote = currentInShift ? `[Hiện có: ${currentInShift}]` : `[Đang trống chỗ]`;

        availableOptions.push({
          value: sId,
          text: `${d.label} (${dStr}) - ${c.label} (${c.hours}) ${infoNote}`
        });
      });
    });

    if (availableOptions.length === 0) {
      targetSelect.innerHTML = `<option value="">Không có ca nào phù hợp để đổi</option>`;
    } else {
      targetSelect.innerHTML = availableOptions.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
    }
  }

  document.getElementById('modalChangeReq').style.display = 'flex';
  setChangeDialogPresentation(true);
}

function closeChangeModal() {
  document.getElementById('modalChangeReq').style.display = 'none';
  setChangeDialogPresentation(false);
}

// ============================================================================
// 9. VẼ GIAO DIỆN QUẢN LÝ (RENDER MANAGER VIEW VỚI NGÀY THỰC TẾ)
// ============================================================================

function renderManagerView() {
  const weekDates = getWeekDates(currentWeekOffset);
  const weekRangeText = getWeekRangeText(currentWeekOffset);

  // Cập nhật nhãn tuần
  const rangeVal = document.getElementById('managerWeekRangeValue');
  if (rangeVal) rangeVal.innerText = weekRangeText;

  const cardNote = document.getElementById('managerCardWeekNote');
  if (cardNote) cardNote.innerText = `(${weekRangeText})`;

  // Cập nhật tiêu đề ngày trên 7 cột bảng lịch
  for (let i = 0; i < 7; i++) {
    const th = document.getElementById(`mTh${i}`);
    if (th) {
      th.innerHTML = `${DAYS[i].label} <br><span style="font-size:13px; color:var(--color-muted); font-weight:normal;">(${formatDateDM(weekDates[i])})</span>`;
    }
  }

  // Cập nhật stepper bước tiến độ tuần & khóa Bước 4 nếu còn ca thiếu
  const hasMissingShifts = Object.values(appState.shifts).some(s => !evaluateShiftStaffing(s).isMet);
  for (let s = 1; s <= 4; s++) {
    const btn = document.getElementById(`stepBtn${s}`);
    if (btn) {
      if (appState.weekStatus === s) btn.classList.add('active');
      else btn.classList.remove('active');

      if (s === 4) {
        if (hasMissingShifts) {
          btn.innerHTML = '4. Phát hành lịch (Còn ca thiếu)';
          btn.title = 'Bấm để phát hành lịch (chấp nhận ca thiếu để Quản lý trực tiếp làm)';
        } else {
          btn.innerHTML = '4. Phát hành lịch chính thức';
          btn.title = 'Tất cả 21 ca đã đủ người, sẵn sàng phát hành';
        }
      }
    }
  }

  // Vẽ bảng lịch 21 ca
  const matrixContainer = document.getElementById('managerMatrixBody');
  if (matrixContainer) {
    let html = '';
    SHIFT_CONFIGS.forEach(conf => {
      html += `<tr>`;
      html += `<th scope="row" class="shift-col-header-time">
        <div style="font-weight:700; color:var(--color-main);">${conf.label}</div>
        <div style="font-size:13px; color:var(--color-muted); font-family:var(--font-mono);">${conf.hours}</div>
        <div style="font-size:13px; color:var(--color-sub); margin-top:3px;">${conf.summary}</div>
      </th>`;

      DAYS.forEach((day, index) => {
        const shiftId = `${day.key}-${conf.key}`;
        const shift = appState.shifts[shiftId];
        const ev = evaluateShiftStaffing(shift);

        let tileClass = '';
        let badgeHtml = '';

        if (shift.hasChangeReq) {
          tileClass = 'status-pending';
          badgeHtml = `<span class="status-badge pending">Có đơn xin nghỉ</span>`;
        } else if (appState.weekStatus === 1) {
          badgeHtml = `<span class="status-badge" style="background:#FFF; border:1px solid var(--border-color); color:var(--color-sub);">Đăng ký: ${shift.registered.length} NV</span>`;
        } else {
          if (ev.isMet) {
            tileClass = 'status-ok';
            badgeHtml = `<span class="status-badge ok">Đủ người (${ev.totalAssigned})</span>`;
          } else {
            tileClass = 'status-missing';
            badgeHtml = `<span class="status-badge missing">${ev.missingText}</span>`;
          }
        }

        let staffListHtml = '';
        if (shift.assigned.length > 0) {
          staffListHtml = `<div class="assigned-list">`;
          shift.assigned.forEach(id => {
            const emp = EMPLOYEES.find(e => e.id === id);
            const deptClass = emp.dept === 'Bếp' ? 'dept-bep' : emp.dept === 'Phục vụ' ? 'dept-phucvu' : 'dept-phache';
            staffListHtml += `
              <div class="staff-tag ${deptClass}" title="${emp.dept}">
                <span>${escapeHTML(emp.name)}</span>
                <span style="font-size:13px; opacity:0.8;">${emp.id}</span>
              </div>
            `;
          });
          staffListHtml += `</div>`;
        } else if (appState.weekStatus > 1) {
          staffListHtml = `<div style="font-size:13px; color:var(--color-muted); font-style:italic; padding:6px 0;">Chưa xếp nhân sự</div>`;
        }

        html += `<td data-shift-id="${shiftId}" aria-label="${day.label}, ${formatDateDM(weekDates[index])}, ${conf.label}">
          <div class="shift-tile ${tileClass}">
            <div>
              <div class="shift-tile-header">
                <span class="shift-tile-name">${conf.label}</span>
                <span class="shift-tile-hours">${conf.duration}h</span>
              </div>
              <div class="shift-time">${conf.hours}</div>
              ${badgeHtml}
            </div>
            ${staffListHtml}
            <div style="font-size:13px; color:var(--color-muted); text-align:right;">${formatDateDM(weekDates[index])}</div>
          </div>
        </td>`;
      });

      html += `</tr>`;
    });
    matrixContainer.innerHTML = html;
  }

  // Danh sách đơn chờ duyệt
  const reqListContainer = document.getElementById('managerRequestList');
  const pendingRequests = appState.changeRequests.filter(r => r.status === 'CHỜ DUYỆT');
  const countBadge = document.getElementById('pendingReqCountBadge');
  if (countBadge) countBadge.innerText = `${pendingRequests.length} đơn`;

  if (reqListContainer) {
    if (pendingRequests.length === 0) {
      reqListContainer.innerHTML = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:16px 0;">Không có đơn nào chờ xét duyệt.</div>`;
    } else {
      reqListContainer.innerHTML = pendingRequests.map(req => {
        const emp = EMPLOYEES.find(e => e.id === req.empId);
        const shift = appState.shifts[req.shiftId];
        const day = DAYS.find(d => d.key === shift.dayKey);
        const conf = SHIFT_CONFIGS.find(c => c.key === shift.shiftKey);

        let targetShiftText = '';
        if (req.type === 'Xin đổi ca' && req.targetShiftId) {
          const tShift = appState.shifts[req.targetShiftId];
          const tDay = DAYS.find(d => d.key === tShift.dayKey);
          const tConf = SHIFT_CONFIGS.find(c => c.key === tShift.shiftKey);
          targetShiftText = `
            <div style="color:var(--color-main); font-weight:600; margin-bottom:4px;">
              🔄 Đổi từ: <strong>${day.label} - ${conf.label}</strong> sang: <strong>${tDay.label} - ${tConf.label}</strong>
            </div>
          `;
        } else {
          targetShiftText = `
            <div style="color:var(--color-sub); margin-bottom:4px;">
              Ca xin nghỉ: <strong>${day.label} - ${conf.label}</strong> (${conf.hours})
            </div>
          `;
        }

        const approveBtnText = req.type === 'Xin đổi ca' ? 'Duyệt (Đổi ca)' : 'Duyệt (Nghỉ ca)';

        return `
          <div style="background:#FFFFFF; border:1px solid var(--border-color); border-radius:8px; padding:8px 10px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <strong>${escapeHTML(emp.name)} (${emp.id})</strong>
              <span style="color:var(--status-pend-text); font-weight:700;">${req.type}</span>
            </div>
            ${targetShiftText}
            <div style="background:var(--bg-body); padding:4px 6px; border-radius:4px; font-style:italic; margin-bottom:8px; color:var(--color-main);">
              "${escapeHTML(req.reason)}"
            </div>
            <div style="display:flex; gap:6px;">
              <button data-click="approveChangeRequest('${req.id}')" class="btn btn-success" style="flex:1; padding:4px 8px; font-size:13px;">${approveBtnText}</button>
              <button data-click="rejectChangeRequest('${req.id}')" class="btn btn-danger" style="flex:1; padding:4px 8px; font-size:13px;">Từ chối</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Danh sách nhân sự quán 2CE (Tập trung hiển thị rõ NV01, NV02)
  const staffListContainer = document.getElementById('managerStaffList');
  if (staffListContainer) {
    staffListContainer.innerHTML = EMPLOYEES.map(emp => {
      const stats = getEmployeeStats(emp.id);
      const reg = appState.registrations[emp.id];
      const isFeatured = emp.id === 'NV01' || emp.id === 'NV02';

      let statusBadge = '';
      if (reg.isDisqualified) {
        statusBadge = `<span style="color:var(--status-warn-text); font-weight:700;">Bị loại (${stats.totalHours}h)</span>`;
      } else if (!stats.isValid) {
        statusBadge = `<span style="color:var(--status-warn-text); font-weight:700;">Thiếu giờ (${stats.totalHours}h • ${stats.eveningCount} tối)</span>`;
      } else {
        statusBadge = `<span style="color:var(--status-ok-text); font-weight:700;">Đủ tiêu chuẩn (${stats.totalHours}h)</span>`;
      }

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:${isFeatured ? '#FFF8EE' : '#FFFFFF'}; padding:5px 8px; border-radius:6px; border:1px solid ${isFeatured ? 'var(--border-color)' : 'var(--border-sub)'};">
          <div>
            <strong>${emp.id}</strong> - ${escapeHTML(emp.name)} <span style="font-size:13px; color:var(--color-muted);">(${emp.dept})</span>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');
  }
  renderCalendarPresentation('manager');
  renderManagerOverview();
}

// ============================================================================
// 10. VẼ GIAO DIỆN NHÂN VIÊN (RENDER EMPLOYEE VIEW VỚI NGÀY THỰC TẾ)
// ============================================================================

function renderEmployeeView() {
  const empId = appState.currentRole;
  const emp = EMPLOYEES.find(e => e.id === empId);
  if (!emp) return;

  const weekDates = getWeekDates(currentWeekOffset);
  const weekRangeText = getWeekRangeText(currentWeekOffset);

  // Cập nhật nhãn tuần
  const empRangeVal = document.getElementById('empWeekRangeValue');
  if (empRangeVal) empRangeVal.innerText = weekRangeText;

  const empCardNote = document.getElementById('empCardWeekNote');
  if (empCardNote) empCardNote.innerText = `(${weekRangeText})`;

  // Cập nhật tiêu đề ngày trên 7 cột
  for (let i = 0; i < 7; i++) {
    const th = document.getElementById(`eTh${i}`);
    if (th) {
      th.innerHTML = `${DAYS[i].label} <br><span style="font-size:13px; color:var(--color-muted); font-weight:normal;">(${formatDateDM(weekDates[i])})</span>`;
    }
  }

  // Header nhân viên
  const avatarEl = document.getElementById('empHeaderAvatar');
  const nameEl = document.getElementById('empHeaderName');
  const deptEl = document.getElementById('empHeaderDept');
  if (avatarEl) avatarEl.innerText = emp.id;
  if (nameEl) nameEl.innerText = `${emp.name} (${emp.id})`;
  if (deptEl) deptEl.innerText = `Bộ phận: ${emp.dept} • Quán 2CE`;

  // Thông báo tiến độ cổng đăng ký
  const noticeEl = document.getElementById('empPortalNotice');
  if (noticeEl) {
    if (appState.weekStatus === 1) {
      noticeEl.className = 'alert-note info';
      noticeEl.innerHTML = `📢 <strong>Cổng đăng ký đang mở cho ${weekRangeText}:</strong> Vui lòng chọn ca làm việc phù hợp (tối thiểu 20 giờ & 2 ca tối).`;
    } else if (appState.weekStatus === 2) {
      noticeEl.className = 'alert-note warn';
      noticeEl.innerHTML = `🔒 <strong>Cổng đăng ký đã đóng:</strong> Quản lý quán 2CE đang xếp ca cho ${weekRangeText}.`;
    } else if (appState.weekStatus === 3) {
      noticeEl.className = 'alert-note warn';
      noticeEl.innerHTML = `⚠️ <strong>Mở đăng ký bổ sung:</strong> Một số ca trong tuần còn thiếu nhân sự. Bạn có thể bấm đăng ký bổ sung.`;
    } else if (appState.weekStatus === 4) {
      noticeEl.className = 'alert-note success';
      const hasMissing = Object.values(appState.shifts).some(s => !evaluateShiftStaffing(s).isMet);
      if (hasMissing) {
        noticeEl.innerHTML = `✅ <strong>Lịch chính thức đã phát hành cho ${weekRangeText}:</strong> (Một số ca thiếu nhân sự đã được chấp nhận để Quản lý trực tiếp phụ trách/điều phối). Nếu có việc bận đột xuất, bạn có thể gửi đơn xin đổi ca/nghỉ.`;
      } else {
        noticeEl.innerHTML = `✅ <strong>Lịch chính thức đã phát hành cho ${weekRangeText}:</strong> Nếu bận việc đột xuất, bạn có thể gửi đơn xin đổi ca/nghỉ.`;
      }
    }
  }

  // Ghi chú quyền chọn ca
  const permEl = document.getElementById('empDeptPermissionNote');
  if (permEl) {
    if (emp.dept === 'Bếp') {
      permEl.innerText = 'Nhân viên Bếp được chọn Ca Chiều và Ca Tối (Ca Sáng không có Bếp)';
    } else if (emp.dept === 'Phục vụ') {
      permEl.innerText = 'Nhân viên Phục vụ chỉ làm việc vào Ca Tối (Ca Sáng & Chiều không tuyển Phục vụ)';
    } else {
      permEl.innerText = 'Nhân viên Pha chế được chọn cả Ca Sáng, Chiều và Tối';
    }
  }

  // Bảng lịch 21 ca
  const matrixContainer = document.getElementById('empMatrixBody');
  if (matrixContainer) {
    let html = '';
    SHIFT_CONFIGS.forEach(conf => {
      html += `<tr>`;
      html += `<th scope="row" class="shift-col-header-time">
        <div style="font-weight:700; color:var(--color-main);">${conf.label}</div>
        <div style="font-size:13px; color:var(--color-muted); font-family:var(--font-mono);">${conf.hours}</div>
        <div style="font-size:13px; color:var(--color-sub); margin-top:3px;">${conf.summary}</div>
      </th>`;

      DAYS.forEach((day, index) => {
        const shiftId = `${day.key}-${conf.key}`;
        const shift = appState.shifts[shiftId];
        const isRegistered = shift.registered.includes(emp.id);
        const isAssigned = shift.assigned.includes(emp.id);
        const isDeptValid = isDeptAllowed(emp.dept, conf.key);
        const ev = evaluateShiftStaffing(shift);

        let tileClass = '';
        if (isRegistered) tileClass = 'is-picked';
        if (isAssigned) tileClass = 'status-ok';

        let actionBtnHtml = '';

        if (appState.weekStatus === 1) {
          if (!isDeptValid) {
            actionBtnHtml = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:4px;">Không tuyển ${emp.dept}</div>`;
          } else if (isRegistered) {
            actionBtnHtml = `<button data-click="toggleEmployeeShift('${shiftId}')" class="tile-btn btn-unpick">Bỏ chọn ca</button>`;
          } else {
            actionBtnHtml = `<button data-click="toggleEmployeeShift('${shiftId}')" class="tile-btn btn-pick">+ Đăng ký ca</button>`;
          }
        } else if (appState.weekStatus === 2) {
          actionBtnHtml = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:4px;">Đang xếp ca...</div>`;
        } else if (appState.weekStatus === 3) {
          if (!ev.isMet && isDeptValid && !isAssigned && !isRegistered) {
            actionBtnHtml = `<button data-click="toggleEmployeeShift('${shiftId}')" class="tile-btn btn-supp">Đăng ký bổ sung</button>`;
          } else if (isAssigned || isRegistered) {
            actionBtnHtml = `<div style="font-size:13px; color:var(--status-ok-text); font-weight:700; text-align:center; padding:4px;">Đã có ca này</div>`;
          } else {
            actionBtnHtml = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:4px;">Đã đủ người</div>`;
          }
        } else if (appState.weekStatus === 4) {
          if (isAssigned) {
            actionBtnHtml = `<button data-click="openChangeModal('${shiftId}')" class="tile-btn btn-change">Xin đổi / Nghỉ</button>`;
          } else {
            actionBtnHtml = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:4px;">Không có ca</div>`;
          }
        }

        html += `<td data-shift-id="${shiftId}" aria-label="${day.label}, ${formatDateDM(weekDates[index])}, ${conf.label}">
          <div class="shift-tile ${tileClass}">
            <div>
              <div class="shift-tile-header">
                <span class="shift-tile-name">${conf.label}</span>
                <span class="shift-tile-hours">${conf.duration}h</span>
              </div>
              <div class="shift-time">${conf.hours}</div>
              <div style="font-size:13px; color:var(--color-sub);">${isAssigned ? '✓ Bạn được phân công' : isRegistered ? '✓ Bạn đã đăng ký' : 'Chưa đăng ký'}</div>
            </div>
            ${actionBtnHtml}
            <div style="font-size:13px; color:var(--color-muted); text-align:right; margin-top:2px;">${formatDateDM(weekDates[index])}</div>
          </div>
        </td>`;
      });

      html += `</tr>`;
    });
    matrixContainer.innerHTML = html;
  }

  // Thống kê cá nhân
  const stats = getEmployeeStats(emp.id);
  const hoursText = document.getElementById('empHoursText');
  const hoursBar = document.getElementById('empHoursBar');
  const eveText = document.getElementById('empEveText');
  const eveBar = document.getElementById('empEveBar');
  const alertBox = document.getElementById('empRuleAlertBox');
  const btnSubmit = document.getElementById('btnSubmitEmpRegistration');
  const badgeStatus = document.getElementById('empSubmitStatusBadge');

  if (hoursText) hoursText.innerText = `${stats.totalHours} / 20 tiếng ${stats.isHoursValid ? '✅' : '(Chưa đủ)'}`;
  if (hoursBar) {
    hoursBar.style.width = `${Math.min(100, Math.round((stats.totalHours / 20) * 100))}%`;
    hoursBar.className = stats.isHoursValid ? 'stat-bar-fill' : 'stat-bar-fill danger';
  }

  if (eveText) eveText.innerText = `${stats.eveningCount} / 2 ca tối ${stats.isEveningValid ? '✅' : '(Chưa đủ)'}`;
  if (eveBar) {
    eveBar.style.width = `${Math.min(100, Math.round((stats.eveningCount / 2) * 100))}%`;
    eveBar.className = stats.isEveningValid ? 'stat-bar-fill' : 'stat-bar-fill danger';
  }

  if (alertBox) {
    if (appState.weekStatus >= 2) {
      if (stats.isValid) {
        alertBox.className = 'alert-note success';
        alertBox.innerHTML = `<span>✅</span><div><strong>Lịch làm việc đảm bảo:</strong> Bạn đang được phân công đủ ${stats.totalHours} giờ và ${stats.eveningCount} ca tối tuần này.</div>`;
      } else {
        alertBox.className = 'alert-note warn';
        alertBox.innerHTML = `<span>⚠️</span><div><strong>Chưa đủ 20 giờ làm tuần:</strong> Hiện bạn đang được phân công <strong>${stats.totalHours} giờ</strong> (${stats.eveningCount} ca tối) do vừa có ca xin nghỉ/đổi.</div>`;
      }
    } else {
      if (stats.isValid) {
        alertBox.className = 'alert-note success';
        alertBox.innerHTML = `<span>✅</span><div><strong>Đã đạt yêu cầu đăng ký:</strong> Bạn đã chọn đủ ${stats.totalHours} giờ và ${stats.eveningCount} ca tối.</div>`;
      } else {
        alertBox.className = 'alert-note warn';
        alertBox.innerHTML = `<span>⚠️</span><div>Bạn cần đăng ký tối thiểu <strong>20 tiếng</strong> và ít nhất <strong>2 ca tối</strong> để nộp đơn hợp lệ.</div>`;
      }
    }
  }

  if (btnSubmit) {
    btnSubmit.disabled = appState.weekStatus !== 1 || !stats.isValid;
  }

  if (badgeStatus) {
    if (stats.isValid) {
      badgeStatus.className = 'status-badge ok';
      badgeStatus.innerText = `Đủ tiêu chuẩn (${stats.totalHours}h)`;
    } else {
      badgeStatus.className = 'status-badge missing';
      badgeStatus.innerText = `Thiếu giờ (${stats.totalHours}/20h)`;
    }
  }

  // Danh sách ca làm việc của tôi
  const assignedListEl = document.getElementById('empAssignedList');
  if (assignedListEl) {
    const myShifts = [];
    Object.values(appState.shifts).forEach(shift => {
      if (shift.assigned.includes(emp.id)) {
        const day = DAYS.find(d => d.key === shift.dayKey);
        const conf = SHIFT_CONFIGS.find(c => c.key === shift.shiftKey);
        const dayIdx = DAYS.findIndex(d => d.key === shift.dayKey);
        const dateStr = formatDateDM(weekDates[dayIdx]);
        myShifts.push({ dayLabel: day.label, dateStr, shiftLabel: conf.label, hours: conf.hours, shiftId: shift.id });
      }
    });

    if (myShifts.length === 0) {
      assignedListEl.innerHTML = `<div style="font-size:13px; color:var(--color-muted); text-align:center; padding:16px 0;">Chưa có ca làm việc nào được xếp cho bạn tuần này.</div>`;
    } else {
      assignedListEl.innerHTML = myShifts.map(s => `
        <div style="background:#FFFFFF; padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${s.dayLabel} (${s.dateStr})</strong> • ${s.shiftLabel} <span style="color:var(--color-muted);">(${s.hours})</span>
          </div>
          ${appState.weekStatus === 4 ? `
            <button data-click="openChangeModal('${s.shiftId}')" class="btn btn-secondary" style="padding:2px 6px; font-size:13px;">Xin đổi/nghỉ</button>
          ` : ''}
        </div>
      `).join('');
    }
  }
  renderCalendarPresentation('employee');
  updateProgressAccessibility();
}

// ============================================================================
// 11. HÀM CẬP NHẬT TOÀN DIỆN (RENDER ALL)
// ============================================================================

function renderAll() {
  const focusedAction = document.activeElement?.getAttribute('data-click');
  if (currentProfile?.role === 'admin') {
    renderAdminView();
  } else if (appState.currentRole === 'quanly') {
    renderManagerView();
  } else if (appState.currentRole) {
    renderEmployeeView();
  }
  if (focusedAction) {
    const replacement = [...document.querySelectorAll('.active-view button[data-click]')].find(button => button.getAttribute('data-click') === focusedAction);
    replacement?.focus({ preventScroll: true });
  }
}

// Khởi chạy khi tài liệu tải xong
window.addEventListener('DOMContentLoaded', restoreSession);

// ============================================================================
// PRESENTATION ONLY: one calendar DOM, adapted without duplicating shift state.
// These values describe the visible day/group; they are not scheduling data.
// ============================================================================
const calendarPresentation = {
  selectedDay: (new Date().getDay() + 6) % 7,
  groupStart: Math.min(4, Math.floor(((new Date().getDay() + 6) % 7) / 3) * 3)
};

function uiIcon(name) {
  const paths = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
}

function renderManagerOverview() {
  const shifts = Object.values(appState.shifts);
  const staffed = shifts.filter(shift => evaluateShiftStaffing(shift).isMet).length;
  const pending = appState.changeRequests.filter(request => request.status === 'CHỜ DUYỆT').length;
  const overview = document.getElementById('managerOverview');
  overview.innerHTML = [
    ['calendar', shifts.length, 'Ca làm trong tuần', '', 'ca'],
    ['people', EMPLOYEES.length, 'Thành viên đội ngũ', '', 'người'],
    ['check', staffed, 'Ca đã đủ nhân sự', '', `/ ${shifts.length} ca`],
    ['clock', pending, 'Yêu cầu chờ duyệt', pending ? 'attention' : '', 'đơn']
  ].map(([icon, value, label, tone, unit]) => `<div class="overview-item ${tone}">${uiIcon(icon)}<div class="overview-value">${value} <small>${unit}</small></div><p>${label}</p></div>`).join('');
  const status = document.getElementById('managerStatusTag');
  const labels = ['Đang nhận đăng ký', 'Đang xếp ca', 'Nhận ca bổ sung', 'Đã phát hành'];
  status.textContent = labels[appState.weekStatus - 1];
  status.className = `status-badge ${appState.weekStatus === 4 ? 'ok' : 'pending'}`;
  for (let step = 1; step <= 4; step++) {
    const button = document.getElementById(`stepBtn${step}`);
    button.setAttribute('aria-pressed', String(step === appState.weekStatus));
    if (step === appState.weekStatus) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
}

function selectCalendarDay(index, role) {
  calendarPresentation.selectedDay = index;
  renderCalendarPresentation(role);
  const button = document.querySelector(`#${role}CalendarNavigation [data-day="${index}"]`);
  button?.focus({ preventScroll: true });
}

function changeCalendarGroup(direction, role) {
  const starts = [0, 3, 4];
  const current = starts.indexOf(calendarPresentation.groupStart);
  calendarPresentation.groupStart = starts[Math.max(0, Math.min(2, current + direction))];
  renderCalendarPresentation(role);
  const nav = document.getElementById(`${role}CalendarNavigation`);
  const button = nav.querySelector(`[data-group-direction="${direction}"]`);
  (button.disabled ? nav.querySelector(`[data-group-direction="${-direction}"]`) : button)?.focus({ preventScroll: true });
}

function renderCalendarPresentation(role) {
  const manager = role === 'manager';
  const body = document.getElementById(manager ? 'managerMatrixBody' : 'empMatrixBody');
  const table = body.closest('table');
  const dates = getWeekDates(currentWeekOffset);
  const today = new Date().toDateString();
  let nav = document.getElementById(`${role}CalendarNavigation`);
  if (!nav) {
    nav = document.createElement('div');
    nav.id = `${role}CalendarNavigation`;
    nav.className = 'calendar-navigation';
    nav.setAttribute('aria-label', 'Chọn ngày trong tuần');
    table.before(nav);
  }
  const scroll = nav.querySelector('.calendar-day-selector')?.scrollLeft || 0;
  nav.innerHTML = `<div class="calendar-day-selector" role="group" aria-label="Ngày trong tuần">${DAYS.map((day, index) => `<button type="button" class="day-button ${dates[index].toDateString() === today ? 'is-today' : ''}" data-day="${index}" aria-pressed="${calendarPresentation.selectedDay === index}" aria-label="${day.label}, ${formatDateDMY(dates[index])}" data-click="selectCalendarDay(${index}, '${role}')">${day.label === 'Chủ Nhật' ? 'CN' : day.label}<strong>${String(dates[index].getDate()).padStart(2, '0')}</strong></button>`).join('')}</div>
    <div class="calendar-group-controls"><button type="button" class="btn btn-secondary" aria-label="Ba ngày trước" data-group-direction="-1" data-click="changeCalendarGroup(-1, '${role}')" ${calendarPresentation.groupStart === 0 ? 'disabled' : ''}>←</button><span class="calendar-group-label">${DAYS[calendarPresentation.groupStart].label} – ${DAYS[calendarPresentation.groupStart + 2].label}</span><button type="button" class="btn btn-secondary" aria-label="Ba ngày tiếp theo" data-group-direction="1" data-click="changeCalendarGroup(1, '${role}')" ${calendarPresentation.groupStart === 4 ? 'disabled' : ''}>→</button></div>
    <p class="selected-day-label" aria-live="polite">${DAYS[calendarPresentation.selectedDay].label}, ${formatDateDMY(dates[calendarPresentation.selectedDay])}</p>`;
  const selector = nav.querySelector('.calendar-day-selector');
  selector.scrollLeft = scroll;
  if (selector.clientWidth) {
    const selected = selector.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    const bounds = selector.getBoundingClientRect();
    if (selected.right > bounds.right) selector.scrollLeft += selected.right - bounds.right + 4;
    else if (selected.left < bounds.left) selector.scrollLeft += selected.left - bounds.left - 4;
  }
  table.querySelectorAll('thead th[id]').forEach((header, index) => {
    header.dataset.calendarVisible = String(index >= calendarPresentation.groupStart && index < calendarPresentation.groupStart + 3);
    header.classList.toggle('is-today', dates[index].toDateString() === today);
  });
  [...body.rows].forEach(row => {
    [...row.querySelectorAll('td')].forEach((cell, index) => {
      cell.dataset.calendarVisible = String(index >= calendarPresentation.groupStart && index < calendarPresentation.groupStart + 3);
      cell.dataset.mobileSelected = String(index === calendarPresentation.selectedDay);
      cell.querySelectorAll('.tile-btn').forEach(button => {
        button.setAttribute('aria-label', `${button.textContent}: ${DAYS[index].label}, ${cell.querySelector('.shift-tile-name').textContent}`);
      });
    });
  });
  if (manager) {
    const first = dates[0];
    document.getElementById('managerDatePicker').value = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
  }
  const skip = document.querySelector('.skip-link');
  skip.href = manager ? '#workspaceManager' : '#workspaceEmployee';
}

function updateProgressAccessibility() {
  const stats = getEmployeeStats(appState.currentRole);
  [['empHoursBar', stats.totalHours, 20, 'Số giờ đăng ký'], ['empEveBar', stats.eveningCount, 2, 'Số ca tối']].forEach(([id, value, max, label]) => {
    const bar = document.getElementById(id);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', label);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(Math.min(value, max)));
    bar.setAttribute('aria-valuetext', `${value} / ${max}`);
  });
}

let dialogReturnFocus = null;
function setChangeDialogPresentation(open) {
  const overlay = document.getElementById('modalChangeReq');
  if (open) dialogReturnFocus = document.activeElement;
  document.body.classList.toggle('modal-open', open);
  const activeView = document.querySelector('.active-view');
  if (activeView) activeView.inert = open;
  document.querySelector('.skip-link').inert = open;
  if (open) {
    overlay.querySelector('[aria-label="Đóng hộp thoại"]').focus();
  } else {
    dialogReturnFocus?.focus({ preventScroll: true });
  }
}

document.addEventListener('keydown', event => {
  const overlay = document.getElementById('modalChangeReq');
  if (overlay.style.display === 'none') return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeChangeModal();
  }
  if (event.key === 'Tab') {
    const focusable = [...overlay.querySelectorAll('button, input:not([type="hidden"]), select, textarea')].filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

document.getElementById('modalChangeReq').addEventListener('click', event => {
  if (event.target.id === 'modalChangeReq') closeChangeModal();
});

// Reposition the day strip on orientation/breakpoint changes without touching state.
window.matchMedia('(max-width: 767px)').addEventListener('change', () => {
  if (appState.currentRole && currentProfile?.role !== 'admin') renderCalendarPresentation(appState.currentRole === 'quanly' ? 'manager' : 'employee');
});

// Authenticated API integration. Cookies and tokens are never read by this code.
let currentProfile = null;
let serverStaffing = {};
let workspaceRevision = 0;
let dataReady = false;
let loadingSequence = 0;
let pendingAction = false;
let adminAccounts = [];
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function weekKey() { const d=getWeekDates(currentWeekOffset)[0]; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function showStatus(message, error=false) {
  const node=document.getElementById('apiStatus');
  node.hidden=!message; node.textContent=message || '';
  if(error&&currentProfile) {const retry=document.createElement('button');retry.type='button';retry.className='btn btn-secondary';retry.textContent='Tải lại dữ liệu';retry.setAttribute('data-click','retryWorkspace()');node.append(' ',retry);}
  node.className=`alert-note ${error?'warn':'info'} api-status`;
  node.setAttribute('role',error?'alert':'status');
  const dialogError=document.getElementById('changeRequestError');
  if(dialogError) {dialogError.hidden=!(error&&document.getElementById('modalChangeReq').style.display!=='none');dialogError.textContent=error?message:'';}
}
async function api(path,body) {
  let response;
  try { response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-2CE-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)}); }
  catch { throw new Error('Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.'); }
  const result=await response.json().catch(()=>({error:'Máy chủ trả về phản hồi không hợp lệ.'}));
  if(!response.ok) {
    if(response.status===401) { if(document.getElementById('modalChangeReq').style.display!=='none') closeChangeModal(); currentProfile=null; appState.currentRole=null; dataReady=false; ++loadingSequence; switchView('login'); }
    const error=new Error(result.error || 'Thao tác thất bại.');error.status=response.status;throw error;
  }
  return result;
}
async function restoreSession() {
  switchView('login');
  try { const {profile}=await api('/api/auth'); await enterSession(profile); }
  catch(error) { if(error.status!==401) { const el=document.getElementById('loginErrorMsg');el.textContent=error.message;el.style.display='block'; } }
}
async function handleLoginSubmit(event) {
  event?.preventDefault();
  const button=document.querySelector('#loginForm button[type="submit"]');
  if(button.disabled) return;
  button.disabled=true;button.textContent='Đang đăng nhập…';
  const errorEl=document.getElementById('loginErrorMsg');errorEl.style.display='none';
  try {
    const {profile}=await api('/api/auth',{action:'login',phone:document.getElementById('loginUsername').value,password:document.getElementById('loginPassword').value});
    document.getElementById('loginPassword').value='';
    await enterSession(profile);
  } catch(error) {errorEl.textContent=error.message;errorEl.style.display='block';}
  finally {button.disabled=false;button.textContent='Đăng nhập';}
}
async function enterSession(profile) {
  currentProfile=profile;
  appState.currentRole=profile.role==='manager'?'quanly':profile.role==='admin'?'admin':profile.employee_id;
  if(profile.role==='manager') document.querySelector('#viewManager .user-name').textContent=profile.display_name;
  if(profile.role==='admin') {switchView('admin');await loadAdmin();}
  else {switchView(profile.role==='manager'?'manager':'employee');await refreshWorkspace();}
}
async function handleLogout() {
  if(pendingAction) return;
  try {
    await api('/api/auth',{action:'logout'});
    currentProfile=null;appState.currentRole=null;dataReady=false;++loadingSequence;
    EMPLOYEES=[];serverStaffing={};appState.shifts={};appState.registrations={};appState.changeRequests=[];
    document.getElementById('loginPassword').value='';
    showStatus('');switchView('login');
  } catch(error) {showStatus(error.message,true);}
}
function setWorkspaceBusy(busy) {
  document.querySelectorAll('.active-view .page-container').forEach(node=>{node.inert=busy;node.setAttribute('aria-busy',String(busy));});
}
async function refreshWorkspace() {
  if(!currentProfile || currentProfile.role==='admin') return;
  const sequence=++loadingSequence, selected=weekKey();
  dataReady=false;setWorkspaceBusy(true);showStatus('Đang tải lịch làm việc…');
  try {
    const workspace=await api(`/api/workspace?week=${selected}`);
    if(sequence!==loadingSequence) return;
    EMPLOYEES=workspace.employees;serverStaffing=workspace.staffing;workspaceRevision=workspace.revision;
    Object.assign(appState,workspace.state);
    // JSONB object order is not a calendar order; restore the existing day/shift order.
    appState.shifts=Object.fromEntries(DAYS.flatMap(day=>SHIFT_CONFIGS.map(conf=>{const id=`${day.key}-${conf.key}`;return [id,appState.shifts[id]];})));
    dataReady=true;renderAll();renderMyRequests();showStatus('');
  } catch(error) {if(sequence===loadingSequence) showStatus(error.message,true);}
  finally {if(sequence===loadingSequence) setWorkspaceBusy(!dataReady);}
}
async function runAction(action,payload={},successAlert=false) {
  if(pendingAction||!dataReady) return false;
  pendingAction=true;setWorkspaceBusy(true);showStatus('Đang lưu thay đổi…');
  const selectedWeek=weekKey();
  const command={week:selectedWeek,revision:workspaceRevision,requestId:crypto.randomUUID(),action,payload};
  try {
    // Never automatically retry a non-idempotent intent with a new request ID.
    const result=await api('/api/action',command);
    await refreshWorkspace();
    if(!dataReady) {showStatus('Thao tác đã lưu nhưng chưa tải được lịch mới. Vui lòng tải lại trang.',true);return true;}
    if(successAlert) alert(result.message);
    return true;
  } catch(error) {
    if(error.status===409) await refreshWorkspace();
    showStatus(error.message,true);return false;
  } finally {pendingAction=false;setWorkspaceBusy(!dataReady);}
}
async function changeWeekStatus(statusNumber) {
  if(!dataReady||pendingAction||statusNumber===appState.weekStatus) return;
  const hasMissing=Object.values(appState.shifts).some(s=>!evaluateShiftStaffing(s).isMet);
  const acceptMissing=statusNumber===4&&hasMissing;
  if(acceptMissing&&!confirm('Một số ca còn thiếu nhân sự. Bạn có chấp nhận quản lý trực tiếp điều phối và phát hành lịch không?')) return;
  await runAction('phase',{status:statusNumber,acceptMissing},statusNumber===4);
}
async function triggerAutoScheduling() { await runAction('generate',{},true); }
async function approveChangeRequest(requestId) { await runAction('approve',{requestId},true); }
async function rejectChangeRequest(requestId) { await runAction('reject',{requestId},true); }
async function toggleEmployeeShift(shiftId) {
  const shift=appState.shifts[shiftId];if(!shift) return;
  await runAction('registration',{shiftId,selected:appState.weekStatus===3 || !shift.registered.includes(appState.currentRole)});
}
async function handleEmployeeSubmit() { await runAction('submit',{},true); }
async function submitChangeRequestForm() {
  if(pendingAction) return;
  const type=document.querySelector('input[name="changeTypeRadio"]:checked').value;
  const reason=document.getElementById('changeReasonInput').value.trim();
  if(!reason) {alert('Vui lòng nhập lý do cụ thể.');return;}
  const targetShiftId=type==='swap'?document.getElementById('targetShiftSelect').value:null;
  if(type==='swap'&&!targetShiftId) {alert('Vui lòng chọn ca bạn muốn đổi sang.');return;}
  const button=document.querySelector('#modalChangeReq .modal-footer .btn-primary');button.disabled=true;
  try {
    const saved=await runAction('request',{shiftId:document.getElementById('changeShiftIdHidden').value,type,targetShiftId,reason},true);
    if(saved) closeChangeModal();
  } finally {button.disabled=false;}
}
function renderMyRequests() {
  const node=document.getElementById('empRequestHistory');
  if(currentProfile?.role!=='employee') return;
  node.innerHTML=appState.changeRequests.length?appState.changeRequests.map(req=>`<div class="request-history-item"><strong>${escapeHTML(DAYS.find(d=>d.key===appState.shifts[req.shiftId].dayKey).label)} · ${escapeHTML(SHIFT_CONFIGS.find(c=>c.key===appState.shifts[req.shiftId].shiftKey).label)}</strong><span class="status-badge ${req.status==='ĐÃ DUYỆT'?'ok':'pending'}">${escapeHTML(req.status)}</span><p>${escapeHTML(req.type)} — ${escapeHTML(req.reason)}</p></div>`).join(''):'<p class="empty-note">Bạn chưa gửi yêu cầu nào trong tuần này.</p>';
}
async function loadAdmin() {
  showStatus('Đang tải tài khoản…');
  try {const result=await api('/api/admin');adminAccounts=result.accounts;renderAdminView();showStatus('');return true;}
  catch(error) {showStatus(error.message,true);return false;}
}
function renderAdminView() {
  document.getElementById('adminHeaderName').textContent=currentProfile.display_name;
  document.getElementById('adminAccountList').innerHTML=adminAccounts.map(account=>`<div class="account-row"><div><strong>${escapeHTML(account.display_name)}</strong><p>${escapeHTML(account.phone)} · ${escapeHTML({admin:'Quản trị viên',manager:'Quản lý',employee:'Nhân viên'}[account.role])}${account.employee_id?' · '+escapeHTML(account.employee_id):''}</p></div><span class="status-badge ${account.active?'ok':'missing'}">${account.active?'Hoạt động':'Đã khóa'}</span><button type="button" class="btn btn-secondary" data-click="editAdminAccount('${account.id}')" ${account.id===currentProfile.id?'disabled':''}>Chỉnh sửa</button></div>`).join('');
  document.querySelector('.skip-link').href='#workspaceAdmin';
}
function editAdminAccount(id) {
  const account=adminAccounts.find(a=>a.id===id);if(!account||account.id===currentProfile.id) return;
  const form=document.getElementById('adminAccountForm');
  form.elements.id.value=account.id;form.elements.phone.value=account.phone;form.elements.phone.readOnly=true;
  form.elements.displayName.value=account.display_name;form.elements.role.value=account.role;
  form.elements.employeeId.value=account.employee_id||'';form.elements.active.checked=account.active;
  form.elements.password.value='';form.elements.password.required=false;form.elements.password.disabled=true;
  form.scrollIntoView({behavior:'auto',block:'start'});form.elements.displayName.focus();
}
function resetAdminForm() {
  const form=document.getElementById('adminAccountForm');form.reset();form.elements.id.value='';form.elements.phone.readOnly=false;form.elements.password.disabled=false;form.elements.password.required=true;
}
async function saveAdminAccount(event) {
  event.preventDefault();if(pendingAction) return;
  const form=event.currentTarget, fields=form.elements;
  const body={id:fields.id.value||undefined,phone:fields.phone.value,displayName:fields.displayName.value,role:fields.role.value,employeeId:fields.role.value==='employee'?fields.employeeId.value:null,active:fields.active.checked,requestId:crypto.randomUUID()};
  if(!body.id) body.password=fields.password.value;
  pendingAction=true;form.querySelector('[type=submit]').disabled=true;
  try {await api('/api/admin',body);resetAdminForm();if(await loadAdmin())showStatus('Đã lưu tài khoản.');}
  catch(error) {showStatus(error.message,true);}
  finally {pendingAction=false;form.querySelector('[type=submit]').disabled=false;}
}
window.addEventListener('pageshow',event=>{if(event.persisted) restoreSession();});

function retryWorkspace() { if(currentProfile?.role==='admin')loadAdmin();else refreshWorkspace(); }

// Declarative event delegation preserves the existing handler names without eval
// or executable inline attributes, allowing a strict script-src 'self' policy.
const uiHandlers = {
  handleLoginSubmit, handleLogout, changeWeek, resetCurrentWeek, onDatePicked,
  changeWeekStatus, triggerAutoScheduling, approveChangeRequest, rejectChangeRequest,
  toggleEmployeeShift, handleEmployeeSubmit, onChangeTypeToggle, openChangeModal,
  closeChangeModal, submitChangeRequestForm, selectCalendarDay, changeCalendarGroup,
  editAdminAccount, resetAdminForm, saveAdminAccount, retryWorkspace
};
for (const [eventType,attribute] of [['click','data-click'],['change','data-change'],['submit','data-submit']]) {
  document.addEventListener(eventType,event=>{
    const node=event.target.closest(`[${attribute}]`);if(!node)return;
    const match=/^(\w+)\((.*)\)$/.exec(node.getAttribute(attribute));
    if(!match || !Object.hasOwn(uiHandlers,match[1]))return;
    const raw=match[2].trim();
    const tokens=raw?raw.split(',').map(token=>token.trim()):[];
    if(tokens.some(token=>!(/^-?\d+$/.test(token)||/^'[-\w]+'$/.test(token)||token==='this.value'||token==='event')))return;
    const args=tokens.map(token=>token==='event'?{preventDefault:()=>event.preventDefault(),currentTarget:node}:token==='this.value'?node.value:/^'/.test(token)?token.slice(1,-1):Number(token));
    uiHandlers[match[1]](...args);
  });
}
