'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('build removes obsolete output files instead of accidentally publishing them',async()=>{
 const marker=path.join(root,'public/audit-stale-marker.txt');await fs.mkdir(path.dirname(marker),{recursive:true});await fs.writeFile(marker,'TEST ONLY — not a credential');
 try {execFileSync(process.execPath,['scripts/build.cjs'],{cwd:root});await assert.rejects(fs.access(marker),{code:'ENOENT'});}
 finally {await fs.rm(marker,{force:true});}
});
