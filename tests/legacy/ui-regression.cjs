let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/Users/elvyx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const { chromium } = playwright;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const report = { checks: [], viewports: [], errors: [] };
const check = (name, detail = '') => { report.checks.push({ name, result: 'passed', detail }); console.log('PASS', name); };
const businessBaseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'business-baseline.json')));
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const [name, hash] of Object.entries(businessBaseline)) {
  let code = source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))?.[0];
  if (name === 'openChangeModal') code = code.replace('\n  setChangeDialogPresentation(true);', '');
  if (name === 'closeChangeModal') code = code.replace('\n  setChangeDialogPresentation(false);', '');
  assert.equal(crypto.createHash('sha256').update(code).digest('hex'), hash, `Business function changed: ${name}`);
}
check('Original business functions unchanged', `${Object.keys(businessBaseline).length} function hashes matched; only dialog presentation hooks excluded`);
const originalContract = JSON.parse(fs.readFileSync(path.join(__dirname, 'original-contract.json')));
for (const name of ['EMPLOYEES', 'DAYS', 'SHIFT_CONFIGS', 'appState']) {
  const definition = source.match(new RegExp(`^const ${name} = [\\s\\S]*?^[\\]}];`, 'm'))?.[0];
  assert.equal(crypto.createHash('sha256').update(definition).digest('hex'), originalContract[name], `Original constant changed: ${name}`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const id of originalContract.domIds) assert(html.includes(`id="${id}"`), `Original DOM ID removed: ${id}`);
check('Original data, state structure and DOM IDs preserved');


(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await context.newPage();
  let acceptConfirmation = true;
  const dialogs = [];
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::ERR')) report.errors.push(message.text()); });
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialog.type() === 'confirm' && !acceptConfirmation) await dialog.dismiss(); else await dialog.accept();
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const login = async name => {
    await page.locator('#loginUsername').fill(name);
    await page.locator('#loginPassword').fill('123');
    await page.locator('#loginForm button[type=submit]').click();
  };
  const logout = async () => page.locator('.active-view .account-section button').click();
  const evalState = async expression => page.evaluate(expression);
  const capturePage = async filename => {
    const viewport = page.viewportSize();
    const height = await page.evaluate(() => Math.max(innerHeight, document.documentElement.scrollHeight));
    await page.setViewportSize({ width: viewport.width, height });
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path: path.join(root, filename), fullPage: false });
    await page.setViewportSize(viewport);
  };
  const overflow = async () => page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  await page.screenshot({ path: path.join(root, 'screenshots/login.png'), fullPage: true });
  await page.locator('#loginUsername').fill('quanly');
  await page.locator('#loginPassword').fill('wrong');
  await page.locator('#loginForm button[type=submit]').click();
  assert(await page.locator('#loginErrorMsg').isVisible());
  await page.locator('#loginUsername').fill('unknown');
  await page.locator('#loginPassword').fill('123');
  await page.locator('#loginForm button[type=submit]').click();
  assert(await page.locator('#loginErrorMsg').isVisible());
  check('Login validation: wrong password and unknown account');
  await page.screenshot({ path: path.join(root, 'screenshots/login-validation.png'), fullPage: true });
  await login('quanly');
  assert(await page.locator('#viewManager').evaluate(el => el.classList.contains('active-view')));
  check('Manager login');
  assert.equal(await evalState('Object.values(appState.shifts).reduce((sum,s) => sum+s.assigned.length,0)'), 0);
  check('Existing initial scheduling behavior preserved', 'Initial phase 2 has no assignments because algorithm validates assigned hours after clearing assignments');
  const range = await page.locator('#managerWeekRangeValue').innerText();
  await page.locator('#viewManager .week-nav-controls button').nth(0).click();
  assert.equal(await evalState('currentWeekOffset'), -1);
  await page.locator('#viewManager .week-nav-controls button').nth(2).click();
  assert.equal(await evalState('currentWeekOffset'), 0);
  await page.locator('#viewManager .week-nav-controls button').nth(2).click();
  assert.equal(await evalState('currentWeekOffset'), 1);
  await page.locator('#viewManager .week-nav-controls button').nth(1).click();
  assert.equal(await page.locator('#managerWeekRangeValue').innerText(), range);
  check('Previous, next and current week navigation');
  await page.locator('#managerDatePicker').fill('2026-11-16');
  await page.locator('#managerDatePicker').dispatchEvent('change');
  assert((await page.locator('#managerWeekRangeValue').innerText()).includes('16/11/2026'));
  await page.locator('#viewManager .week-nav-controls button').nth(1).click();
  assert.equal(await page.locator('#managerDatePicker').inputValue(), await evalState("(() => {const d=getWeekDates()[0]; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()"));
  check('Date selection');
  for (const step of [1, 2, 3]) {
    await page.locator(`#stepBtn${step}`).click();
    assert.equal(await evalState('appState.weekStatus'), step);
    assert.equal(await page.locator(`#stepBtn${step}`).getAttribute('aria-current'), 'step');
  }
  acceptConfirmation = false;
  await page.locator('#stepBtn4').click();
  assert.equal(await evalState('appState.weekStatus'), 3);
  acceptConfirmation = true;
  await page.locator('#stepBtn4').click();
  assert.equal(await evalState('appState.weekStatus'), 4);
  check('Four-step workflow and publication confirmation accept/cancel');
  await page.locator('#stepBtn1').click();
  await page.locator('button[onclick="triggerAutoScheduling()"]').click();
  assert((await evalState('Object.values(appState.shifts).filter(s=>s.assigned.length).length')) > 0);
  assert.equal(await evalState('appState.weekStatus'), 3);
  const schedulingSnapshot = await evalState('JSON.stringify(appState.shifts)');
  check('Automatic scheduling with existing seeded registrations', 'Executed from open-registration phase so original hour validation has registered hours');
  assert.equal(await evalState("evaluateShiftStaffing({shiftKey:'morn',assigned:['NV10']}).isMet"), true);
  assert.equal(await evalState("evaluateShiftStaffing({shiftKey:'after',assigned:['NV01','NV10']}).isMet"), true);
  assert.equal(await evalState("evaluateShiftStaffing({shiftKey:'eve',assigned:['NV01','NV02','NV07','NV08','NV10','NV11']}).isMet"), true);
  assert.equal(await evalState("evaluateShiftStaffing({shiftKey:'eve',assigned:['NV01','NV07','NV10']}).missingText"), 'Thiếu: 1 Bếp, 1 Phục vụ, 1 Pha chế');
  check('Staffing requirement calculations for all three shifts');
  await page.locator('#stepBtn1').click();
  await logout();
  assert(await page.locator('#viewLogin').evaluate(el => el.classList.contains('active-view')));
  check('Logout');
  await login('01');
  assert.equal(await evalState('appState.currentRole'), 'NV01');
  check('Employee login and numeric account alias');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('#employeeCalendarNavigation [data-day="0"]').click();
  const shift = page.locator('#empMatrixBody td[data-shift-id="mon-after"]');
  assert.equal(await shift.locator('button').innerText(), 'Bỏ chọn ca');
  await shift.locator('button').click();
  assert.equal(await evalState("appState.shifts['mon-after'].registered.includes('NV01')"), false);
  assert(await page.locator('#empMatrixBody td[data-shift-id="mon-after"] button').evaluate(el => el === document.activeElement));
  await shift.locator('button').click();
  assert.equal(await evalState("appState.shifts['mon-after'].registered.includes('NV01')"), true);
  assert.equal(await page.locator('#empHoursText').innerText(), '22 / 20 tiếng ✅');
  assert((await page.locator('#empEveText').innerText()).startsWith('3 / 2'));
  check('Mobile shift registration, cancellation, hours and night-shift progress');
  assert.equal(await page.locator('#empMatrixBody td[data-shift-id="mon-morn"] button').count(), 0);
  assert((await page.locator('#empMatrixBody td[data-shift-id="mon-morn"]').innerText()).includes('Không tuyển Bếp'));
  await page.locator('#btnSubmitEmpRegistration').click();
  assert.equal(await evalState("appState.registrations.NV01.isSubmitted"), true);
  check('Department restrictions and valid registration submission');
  // Reach invalid registration via the same visible mobile controls.
  for (const day of [1, 3, 5]) {
    await page.locator(`#employeeCalendarNavigation [data-day="${day}"]`).click();
    await page.locator(`#empMatrixBody td[data-shift-id="${['mon','tue','wed','thu','fri','sat','sun'][day]}-eve"] button`).click();
  }
  assert(await page.locator('#btnSubmitEmpRegistration').isDisabled());
  const dialogsBeforeInvalid = dialogs.length;
  await evalState('handleEmployeeSubmit()');
  assert(dialogs.length > dialogsBeforeInvalid);
  check('Insufficient hours/night-shift validation and disabled submission');
  // Restore the original scheduling output, then exercise supplementary UI.
  await page.evaluate(snapshot => { appState.shifts = JSON.parse(snapshot); appState.weekStatus = 3; renderAll(); }, schedulingSnapshot);
  const supplementId = await evalState("Object.values(appState.shifts).find(s=>!evaluateShiftStaffing(s).isMet && isDeptAllowed('Bếp',s.shiftKey) && !s.assigned.includes('NV01') && !s.registered.includes('NV01')).id");
  await page.locator(`#employeeCalendarNavigation [data-day="${['mon','tue','wed','thu','fri','sat','sun'].indexOf(supplementId.split('-')[0])}"]`).click();
  await page.locator(`#empMatrixBody td[data-shift-id="${supplementId}"] button`).click();
  assert.equal(await evalState(`appState.shifts['${supplementId}'].assigned.includes('NV01')`), true);
  check('Mobile supplementary shift registration');
  await logout(); await login('quanly');
  await page.locator('#stepBtn4').click();
  await logout(); await login('NV01');
  const assignedIds = await evalState("Object.values(appState.shifts).filter(s=>s.assigned.includes('NV01')).map(s=>s.id)");
  const openAssigned = async id => {
    await page.locator(`#employeeCalendarNavigation [data-day="${['mon','tue','wed','thu','fri','sat','sun'].indexOf(id.split('-')[0])}"]`).click();
    await page.locator(`#empMatrixBody td[data-shift-id="${id}"] button`).click();
  };
  await openAssigned(assignedIds[0]);
  assert(await page.locator('.modal-content [aria-label="Đóng hộp thoại"]').evaluate(el => el === document.activeElement));
  assert.equal(await page.locator('#viewEmployee').evaluate(el=>el.inert), true);
  await page.locator('.modal-footer .btn-primary').focus();
  await page.keyboard.press('Tab');
  assert(await page.locator('.modal-header button').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  assert(await page.locator('.modal-footer .btn-primary').evaluate(el => el === document.activeElement));
  await page.setViewportSize({width:320,height:360});
  const dialogBounds = await page.locator('.modal-content').boundingBox();
  assert(dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= 361);
  assert(await page.locator('.modal-footer .btn-primary').isVisible());
  await page.setViewportSize({width:393,height:852});
  await page.keyboard.press('Escape');
  assert(!(await page.locator('#modalChangeReq').isVisible()));
  assert(await page.locator(`#empMatrixBody td[data-shift-id="${assignedIds[0]}"] button`).evaluate(el => el === document.activeElement));
  check('Accessible dialog: focus trap, Escape, inert background and focus restoration');
  await openAssigned(assignedIds[0]);
  const beforeReason = dialogs.length;
  await page.locator('.modal-footer .btn-primary').click();
  assert(dialogs.length > beforeReason);
  assert(await page.locator('#modalChangeReq').isVisible());
  await page.locator('#changeReasonInput').fill('Bận lịch thi tại trường');
  await page.screenshot({ path: path.join(root, 'screenshots/mobile-dialog.png'), fullPage: false });
  await page.locator('.modal-footer .btn-primary').click();
  assert.equal(await evalState('appState.changeRequests[0].type'), 'Xin nghỉ đột xuất');
  check('Emergency leave request and required reason validation');
  await logout(); await login('quanly');
  assert((await page.locator('#pendingReqCountBadge').innerText()).includes('1'));
  await page.locator('#managerRequestList .btn-danger').click();
  assert.equal(await evalState('appState.changeRequests[0].status'), 'TỪ CHỐI');
  assert.equal(await evalState(`appState.shifts['${assignedIds[0]}'].assigned.includes('NV01')`), true);
  check('Manager rejection retains original assignment');
  await logout(); await login('NV01');
  await openAssigned(assignedIds[0]);
  await page.locator('input[value=swap]').check();
  assert(await page.locator('#swapTargetShiftBox').isVisible());
  const target = await page.locator('#targetShiftSelect').inputValue();
  await page.locator('#changeReasonInput').fill('Đổi ca để phù hợp lịch học');
  const beforeTargetValidation = dialogs.length;
  await page.locator('#targetShiftSelect').evaluate(el => { el.value = ''; });
  await page.locator('.modal-footer .btn-primary').click();
  assert(dialogs.length > beforeTargetValidation);
  assert(await page.locator('#modalChangeReq').isVisible());
  await page.locator('#targetShiftSelect').selectOption(target);
  check('Missing swap target validation');
  assert(target && target !== assignedIds[0]);
  await page.locator('#changeReasonInput').fill('Đổi ca để phù hợp lịch học');
  await page.locator('.modal-footer .btn-primary').click();
  await logout(); await login('quanly');
  await page.locator('#managerRequestList .btn-success').click();
  assert.equal(await evalState('appState.changeRequests[0].status'), 'ĐÃ DUYỆT');
  assert.equal(await evalState(`appState.shifts['${target}'].assigned.includes('NV01')`), true);
  assert.equal(await evalState(`appState.shifts['${assignedIds[0]}'].assigned.includes('NV01')`), false);
  check('Shift change request and manager approval');
  await logout(); await login('NV01');
  await openAssigned(target);
  await page.locator('#changeReasonInput').fill('Việc gia đình đột xuất');
  await page.locator('.modal-footer .btn-primary').click();
  await logout(); await login('quanly');
  await page.locator('#managerRequestList .btn-success').click();
  assert.equal(await evalState('appState.changeRequests[0].status'), 'ĐÃ DUYỆT');
  assert.equal(await evalState(`appState.shifts['${target}'].assigned.includes('NV01')`), false);
  check('Emergency leave approval and reassignment');
  // Every requested size: manager and employee, no duplicate IDs, no page overflow,
  // and exactly 3 / 9 / 21 visible shift cells for mobile / tablet / desktop.
  const sizes = [[320,568],[375,667],[393,852],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
  for (const role of ['quanly', 'NV01']) {
    if (await evalState('appState.currentRole') !== role) { await logout(); await login(role); }
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      const result = await overflow();
      assert(result.document <= width && result.body <= width, `Overflow ${role} ${width}: ${JSON.stringify(result)}`);
      const overflowingPanels = await page.locator('.active-view #managerStaffList, .active-view #managerRequestList, .active-view #empAssignedList').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.id));
      assert.deepEqual(overflowingPanels, [], `Panel overflow ${role} ${width}`);
      const prefix = role === 'quanly' ? 'manager' : 'emp';
      const visibleCells = await page.locator(`#${prefix}MatrixBody td:visible`).count();
      assert.equal(visibleCells, width < 768 ? 3 : width < 1200 ? 9 : 21, `${role} visible cells at ${width}`);
      assert.equal(await page.evaluate(() => { const ids=[...document.querySelectorAll('[id]')].map(e=>e.id); return ids.length-new Set(ids).size; }),0);
      const undersizedButtons = await page.locator('.active-view button:visible').evaluateAll(buttons => buttons.filter(el => el.getBoundingClientRect().height < 43.5 || el.getBoundingClientRect().width < 43.5).map(el => el.textContent.trim()));
      assert.deepEqual(undersizedButtons, [], `Touch targets ${role} ${width}`);
      report.viewports.push({role,width,height,visibleCells,overflow:false});
      if ((width===393 || width===768 || width===1440 || width===1920) && role==='quanly') await capturePage(`screenshots/manager-${width}.png`);
      if (width===393 && role==='NV01') await capturePage('screenshots/employee-mobile.png');
    }
  }
  check('All 9 requested viewport sizes for both roles', '18 combinations; no page overflow or duplicate IDs; correct day counts');
  await page.setViewportSize({width:768,height:1024});
  await page.locator('#employeeCalendarNavigation [data-group-direction="-1"]').click();
  await page.locator('#employeeCalendarNavigation [data-group-direction="1"]').click();
  await page.locator('#employeeCalendarNavigation [data-group-direction="1"]').click();
  assert.equal(await page.locator('#empMatrixBody td:visible').count(),9);
  assert(await page.locator('#empMatrixBody td[data-shift-id="sun-eve"]').isVisible());
  check('Tablet day-group navigation reaches Sunday');
  await page.setViewportSize({width:393,height:852});
  await page.locator('#employeeCalendarNavigation [data-day="6"]').click();
  await page.setViewportSize({width:852,height:393});
  await page.setViewportSize({width:393,height:852});
  assert(await page.locator('#empMatrixBody td[data-shift-id="sun-eve"]').isVisible());
  check('Orientation change preserves selected day');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.btn-primary').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  check('Reduced-motion preference');
  await logout();
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    const result=await overflow(); assert(result.document<=width && result.body<=width);
  }
  check('Login fits all requested viewport sizes');
  // 200% browser zoom has the same layout viewport as a half-width window.
  await page.setViewportSize({width:683,height:384}); await login('quanly');
  assert.equal(await page.locator('#managerMatrixBody td:visible').count(),3);
  const zoomResult=await overflow();assert(zoomResult.document<=683);
  check('200% zoom-equivalent layout viewport', '683×384 CSS viewport; physical Safari browser zoom remains unverified');
  assert.deepEqual(report.errors,[]);
  check('Browser console and runtime errors', 'No application errors');
  report.nativeDialogs=dialogs.length;
  report.generatedAt=new Date().toISOString();
  fs.writeFileSync(path.join(root,'tests/results.json'),JSON.stringify(report,null,2));
  await browser.close();
})().catch(error=>{report.failure=error.stack;fs.writeFileSync(path.join(root,'tests/results.json'),JSON.stringify(report,null,2));console.error(error);process.exit(1);});
