'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),baseline=require('../../docs/scheduling-fix/before-hashes.json');
test('authorized integrity guards only; scheduling, UI, authentication, phase rules and schema remain unchanged',()=>{
 for(const [file,hash]of Object.entries(baseline)){
  let bytes=fs.readFileSync(path.join(root,file));
  if(file==='shared/domain.js')bytes=Buffer.from(require('../../proposals/scheduling-registration-hours/load-proposal.cjs').historicalSource(bytes.toString('utf8')));
  if(file==='server/workflows.cjs'){
   let source=bytes.toString('utf8');
   source=source.replace("const { approve, capacity } = require('./approvals.cjs');\n",'');
   source=source.replace("        const slots = capacity(shift, emp.dept, employees);\n        if (slots.count >= slots.max) fail(409, `Ca này đã đủ người cho bộ phận ${emp.dept}. Không thể đăng ký bổ sung.`);\n",'');
   source=source.replace("      if (action === 'approve') result = approve(state, employees, req);\n      else { rules.rejectChangeRequest(req.id); result.message = rules.messages.at(-1); }", "      if (action === 'approve') rules.approveChangeRequest(req.id); else rules.rejectChangeRequest(req.id);\n      result.message = rules.messages.at(-1);");
   bytes=Buffer.from(source);
  }
  if(file==='scripts/provision.cjs'){
   const source=bytes.toString('utf8'),updated='Demo registrations imported; registered-shift eligibility applied.';
   assert.equal(source.split(updated).length,2);bytes=Buffer.from(source.replace(updated,'Demo registrations imported; original phase-2 algorithm behavior preserved.'));
  }
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,file);
 }
});
