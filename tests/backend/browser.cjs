'use strict';
// Local integration E2E: real application/API + PostgreSQL (PGlite), injected
// test identity provider. This is NOT a live Supabase Auth test or production mode.
const {chromium}=require('playwright');const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');const {database,DatabaseBackend,profiles}=require('./helpers.cjs');
const {createHandler}=require('../../server/handler.cjs');const {securityHeaders}=require('../../server/static.cjs');
const root=path.resolve(__dirname,'../..'),artifacts=path.join(__dirname,'artifacts');
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});const db=await database();const backend=new DatabaseBackend(db);let handler;
 const server=http.createServer(async(req,res)=>{
   if(req.url.startsWith('/api/'))return handler(req,res);
   const pathname=new URL(req.url,'http://localhost').pathname;
   const file=pathname==='/'?'index.html':pathname.slice(1);
   if(!['index.html','app.js','style.css','shared/domain.js'].includes(file)){res.statusCode=404;return res.end();}
   securityHeaders(res);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({backend,origin});
 const browser=await chromium.launch({headless:true,args:['--disable-gpu'],executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[],checks=[],dialogs=[];const pass=name=>{checks.push(name);console.log('PASS',name);};
 const contexts=[];
 const newPage=async()=>{const c=await browser.newContext({viewport:{width:768,height:1024},locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh'});contexts.push(c);await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());return d.accept();});await p.goto(origin);return p;};
 const ready=page=>page.waitForFunction(()=>dataReady&&!pendingAction);
 const login=async(page,role)=>{await page.locator('#loginUsername').fill(profiles[role].phone);await page.locator('#loginPassword').fill(backend.loginPassword);await page.locator('#loginForm button').click();if(role==='admin')await page.locator('#adminAccountList .account-row').first().waitFor();else await ready(page);};
 const action=async(page,selector)=>{await page.locator(selector).click();await ready(page);};
 try {
   const manager=await newPage();
   await manager.locator('#loginUsername').fill(profiles.manager.phone);await manager.locator('#loginPassword').fill('invalid');await manager.locator('#loginForm button').click();await manager.locator('#loginErrorMsg').waitFor({state:'visible'});pass('Invalid login displays Vietnamese error');
   await login(manager,'manager');await action(manager,'#stepBtn1');pass('Manager phone login and server-backed workflow');
   const employee=await newPage();
   let finishLoad;
   const loadGate=new Promise(resolve=>{finishLoad=resolve;});
   await employee.route('**/api/workspace?*',async route=>{await loadGate;await route.continue();},{times:1});
   const entering=login(employee,'employee');
   try {
     await employee.locator('#viewEmployee table.is-loading-skeleton').waitFor();
     assert.equal(await employee.locator('#empMatrixBody .shift-tile:visible').count(),9);
     assert.equal(await employee.locator('#apiStatus').evaluate(el=>getComputedStyle(el).position),'absolute');
   } finally {finishLoad();}
   await entering;
   assert.equal(await employee.locator('.is-loading-skeleton').count(),0);
   pass('Slow tablet calendar load shows three days of placeholders and removes them on response');
   for(const [day,key] of [[0,'mon-after'],[1,'tue-eve'],[3,'thu-eve'],[5,'sat-eve']]) {
     await employee.setViewportSize({width:393,height:852});await employee.locator(`#employeeCalendarNavigation [data-day="${day}"]`).click();
     const tile=employee.locator(`#empMatrixBody td[data-shift-id="${key}"] .shift-tile`);
     if(day===0){
       let finishSave;
       const saveGate=new Promise(resolve=>{finishSave=resolve;});
       await employee.route('**/api/action',async route=>{await saveGate;await route.continue();},{times:1});
       await employee.emulateMedia({reducedMotion:'reduce'});
       const height=(await tile.boundingBox()).height;
       await tile.locator('button').click();
       try {
         await employee.locator('#empMatrixBody .shift-tile.is-loading-skeleton').waitFor();
         assert.equal(await employee.locator('.is-loading-skeleton').count(),1);
         assert.equal((await tile.boundingBox()).height,height);
         assert.equal(await tile.evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
       } finally {finishSave();}
       await ready(employee);
       assert.equal(await employee.locator('.is-loading-skeleton').count(),0);
       await employee.emulateMedia({reducedMotion:'no-preference'});
       pass('Slow registration skeleton stays in the selected mobile tile, preserves height and respects reduced motion');
     }else await action(employee,`#empMatrixBody td[data-shift-id="${key}"] button`);
   }
   assert((await employee.locator('#empHoursText').innerText()).startsWith('22 / 20'));await action(employee,'#btnSubmitEmpRegistration');await employee.reload();await ready(employee);assert((await employee.locator('#empHoursText').innerText()).startsWith('22 / 20'));pass('Mobile registration, working hours, submission and persistence after reload');
   await employee.locator('#employeeCalendarNavigation [data-day="0"]').click();await action(employee,'#empMatrixBody td[data-shift-id="mon-after"] button');assert((await employee.locator('#empHoursText').innerText()).startsWith('18 / 20'));assert(await employee.locator('#btnSubmitEmpRegistration').isDisabled());assert.match(await employee.locator('#empSubmitHint').innerText(),/Thay đổi chưa gửi/);await action(employee,'#empMatrixBody td[data-shift-id="mon-after"] button');pass('Cancellation and invalid-submit state');
   await manager.reload();await ready(manager);await action(manager,'button[data-click="triggerAutoScheduling()"]');assert.equal(await manager.evaluate(()=>appState.weekStatus),3);
   await employee.reload();await ready(employee);
   assert(await employee.locator('#btnSubmitEmpRegistration').isDisabled());
   const send=employee.locator('#btnSubmitEmpRegistration');
   assert.equal(await send.innerText(),'Gửi đơn đăng ký bổ sung');
   await employee.locator('#employeeCalendarNavigation [data-day="2"]').click();
   const extra=employee.locator('#empMatrixBody td[data-shift-id="wed-eve"] button');
   const mySchedule=employee.locator('#empAssignedList');
   const beforeSupplement=await mySchedule.innerText();
   await extra.click();assert(await send.isEnabled());assert.equal(await mySchedule.innerText(),beforeSupplement);
   await extra.click();assert(await send.isDisabled());
   await extra.click();await action(employee,'#btnSubmitEmpRegistration');await employee.reload();await ready(employee);
   assert.equal(await mySchedule.innerText(),beforeSupplement);
   await action(employee,'#empRequestHistory button');assert.match(await employee.locator('#empRequestHistory').innerText(),/ĐÃ RÚT/);
   await employee.locator('#employeeCalendarNavigation [data-day="2"]').click();
   await extra.click();await action(employee,'#btnSubmitEmpRegistration');
   await manager.reload();await ready(manager);
   assert.match(await manager.locator('#managerRequestList .btn-success').innerText(),/Duyệt nhận ca/);
   await action(manager,'#managerRequestList .btn-success');
   await employee.reload();await ready(employee);assert.notEqual(await mySchedule.innerText(),beforeSupplement);
   assert.match(await employee.locator('#empRequestHistory').innerText(),/ĐÃ DUYỆT/);
   pass('Supplement: choose, undo, submit, reload pending, withdraw, resubmit and add to schedule only after manager approval');
   await action(manager,'button[data-click="triggerAutoScheduling()"]');
   await employee.reload();await ready(employee);
   assert(await employee.evaluate(()=>appState.shifts['wed-eve'].assigned.includes('NV01')));
   assert.match(await mySchedule.innerText(),/giữ chỗ/);
   pass('Regeneration preserves the approved supplemental seat in the employee schedule');
   await action(manager,'#stepBtn4');assert.equal(await manager.evaluate(()=>appState.weekStatus),4);pass('Server scheduling and acknowledged publication');
   await employee.reload();await ready(employee);
   const request=async(key,type='leave')=>{
     const day=['mon','tue','wed','thu','fri','sat','sun'].indexOf(key.split('-')[0]);await employee.locator(`#employeeCalendarNavigation [data-day="${day}"]`).click();await employee.locator(`#empMatrixBody td[data-shift-id="${key}"] button`).click();
     if(key==='mon-after' && type==='leave'){
       const dialog=employee.getByRole('dialog');
       const close=dialog.getByRole('button',{name:'Đóng hộp thoại'});
       const submit=dialog.getByRole('button',{name:'Gửi Đơn Cho Quản Lý'});
       assert(await close.evaluate(el=>el===document.activeElement));
       await employee.keyboard.press('Shift+Tab');
       assert(await submit.evaluate(el=>el===document.activeElement));
       await employee.keyboard.press('Tab');
       assert(await close.evaluate(el=>el===document.activeElement));
       await employee.keyboard.press('Escape');
       const opener=employee.locator('#empMatrixBody td[data-shift-id="mon-after"] button');
       assert(await opener.evaluate(el=>el===document.activeElement));
       await opener.press('Enter');await dialog.waitFor();
       pass('Change-request dialog traps keyboard focus, Escape restores the shift button, Enter reopens it');
     }
     if(type==='swap'){await employee.locator('input[value=swap]').check();await employee.locator('#targetShiftSelect').selectOption('wed-after');}
     await employee.locator('#changeReasonInput').fill('<img src=x onerror="window.xss=true"> Bận lịch thi');await employee.locator('#modalChangeReq .modal-footer .btn-primary').click();await ready(employee);await employee.locator('#modalChangeReq').waitFor({state:'hidden'});
   };
   await request('mon-after');await manager.reload();await ready(manager);assert((await manager.locator('#managerRequestList').innerText()).includes('<img'));assert.equal(await manager.evaluate(()=>window.xss),undefined);const originalCommit=backend.commit.bind(backend),dialogCount=dialogs.length;
   backend.commit=async()=>{throw new Error('Injected database failure');};
   try {await action(manager,'#managerRequestList .btn-success');assert.equal(dialogs.length,dialogCount);assert((await manager.locator('#apiStatus').innerText()).includes('Có lỗi máy chủ'));assert.equal(await manager.locator('#managerRequestList .btn-success').count(),1);}
   finally {backend.commit=originalCommit;}
   await manager.reload();await ready(manager);assert.equal(await manager.locator('#managerRequestList .btn-success').count(),1);pass('Failed approval commit shows error, no success dialog or optimistic final state; pending request survives reload');
   await action(manager,'#managerRequestList .btn-success');await employee.reload();await ready(employee);assert((await employee.locator('#empRequestHistory').innerText()).includes('ĐÃ DUYỆT'));pass('Employee leave request, manager approval, escaped stored text and own history');
   await request('tue-eve');await manager.reload();await ready(manager);await action(manager,'#managerRequestList .btn-danger');await employee.reload();await ready(employee);assert((await employee.locator('#empRequestHistory').innerText()).includes('TỪ CHỐI'));pass('Manager rejection persists and appears to the requesting employee');
   // Supply a valid previously submitted destination for the swap journey.
   const swapWeek=await manager.evaluate(()=>weekKey()),swapSnapshot=await backend.snapshot(swapWeek);
   swapSnapshot.state.shifts['wed-after'].registered.push('NV01');
   swapSnapshot.state.registrations.NV01.submittedShifts['wed-after']=1;
   await backend.commit({p_actor:profiles.manager.id,p_action:'demo_seed',p_expected_employee_id:null,p_request:require('node:crypto').randomUUID(),p_week:swapWeek,p_revision:swapSnapshot.revision,p_fingerprint:'registered-swap-fixture',p_state:swapSnapshot.state,p_result:{message:'Existing registration fixture'}});
   await employee.reload();await ready(employee);await request('thu-eve','swap');
   await manager.reload();await ready(manager);await action(manager,'#managerRequestList .btn-success');await employee.reload();await ready(employee);assert(await employee.evaluate(()=>appState.shifts['wed-after'].assigned.includes('NV01')));pass('Shift-change request and approval persist');
   const admin=await newPage();await login(admin,'admin');assert(await admin.locator('#viewAdmin').evaluate(el=>el.classList.contains('active-view')));assert(await admin.locator('.account-row button').first().isDisabled());pass('Separate account-only Admin dashboard and self-edit guard');
   // The approved defect must be exercised through the real local API at step 2,
   // using all 73 original registrations rather than only the employee UI fixture.
   const regressionWeek=await manager.evaluate(()=>{const d=getWeekDates(8)[0];return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
   const demoState=require('../../scripts/submitted-demo.cjs')();
   await backend.commit({p_actor:profiles.manager.id,p_action:'demo_seed',p_expected_employee_id:null,p_request:require('node:crypto').randomUUID(),p_week:regressionWeek,p_revision:0,p_fingerprint:'approved-scheduling-regression',p_state:demoState,p_result:{message:'Local regression fixture'}});
   await manager.locator('#managerDatePicker').fill(regressionWeek);await manager.locator('#managerDatePicker').dispatchEvent('change');await ready(manager);
   assert.equal(await manager.evaluate(()=>appState.weekStatus),2);
   assert.equal(await manager.evaluate(()=>Object.values(appState.shifts).reduce((n,s)=>n+s.registered.length,0)),73);
   await action(manager,'button[data-click="triggerAutoScheduling()"]');
   assert.equal(await manager.evaluate(()=>Object.values(appState.shifts).reduce((n,s)=>n+s.assigned.length,0)),65);
   assert.equal(await manager.evaluate(()=>Object.values(appState.registrations).filter(r=>r.isDisqualified).length),0);
   pass('Approved step-2 regression through UI/API: 73 registrations, 65 assignments, zero disqualifications');
   await manager.reload();await ready(manager);
   // Reload restores the current week by design; select the persisted test week again.
   await manager.locator('#managerDatePicker').fill(regressionWeek);await manager.locator('#managerDatePicker').dispatchEvent('change');await ready(manager);
   assert.equal(await manager.evaluate(()=>Object.values(appState.shifts).reduce((n,s)=>n+s.assigned.length,0)),65);
   pass('Corrected 65-assignment schedule persists across page reload');
   await action(manager,'#viewManager .week-nav-controls button:nth-child(2)');
   const sizes=[[320,568],[375,667],[393,852],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
   for(const [page,role] of [[manager,'manager'],[employee,'employee'],[admin,'admin']])for(const [width,height]of sizes){
     await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${role} overflow at ${width}`);
     if(role!=='admin'){assert.equal(await page.locator(role==='manager'?'#managerMatrixBody td:visible':'#empMatrixBody td:visible').count(),width<768?3:width<1200?9:21);}
     if(role==='employee'&&width>=768&&width<1200){const a=await page.locator('.assigned-shifts-card').boundingBox(),b=await page.locator('.registration-progress-card').boundingBox();assert(b.x>a.x);}
     if([393,768,1440].includes(width)){const fullHeight=await page.evaluate(()=>document.documentElement.scrollHeight);await page.setViewportSize({width,height:Math.max(height,fullHeight)});
       // Headless Chrome can repeat a backdrop-filter layer in tall captures.
       // Disable that blur only in the test capture; production CSS is unchanged.
       await page.addStyleTag({content:'.main-header { backdrop-filter: none !important; }'});
       await page.evaluate(()=>{scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:path.join(artifacts,`${role}-${width}.png`)});await page.setViewportSize({width,height});}
   }pass('27 role/viewport combinations: calendar views, tablet panel order and no page overflow');
   await employee.setViewportSize({width:393,height:852});await employee.locator('#employeeCalendarNavigation [data-day="6"]').click();await employee.setViewportSize({width:852,height:393});await employee.setViewportSize({width:393,height:852});assert(await employee.locator('#empMatrixBody td[data-shift-id="sun-eve"]').isVisible());pass('Selected day survives orientation change');
   const forbidden=await employee.evaluate(async()=>{const r=await fetch('/api/admin');return r.status;});assert.equal(forbidden,403);pass('Direct Employee API call cannot reach Admin data');
   await employee.route('**/api/workspace?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Lỗi kết nối thử nghiệm'})}),{times:1});
   await employee.reload();await employee.locator('#apiStatus button').waitFor();await employee.locator('#apiStatus button').click();await ready(employee);assert.equal(await employee.locator('#workspaceEmployee').evaluate(el=>el.inert),false);pass('Network/data failure has a working retry without a full-page refresh');
   backend.sessions.clear();await employee.reload();await employee.locator('#viewLogin.active-view').waitFor();pass('Expired session returns to login');
   assert.deepEqual(errors,[]);pass('No browser runtime errors');
   const report={kind:'Local integration E2E; Supabase identity provider mocked, PostgreSQL migrations real',checks,viewportCombinations:27,errors,generatedAt:new Date().toISOString()};await fs.writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify(report,null,2));
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
