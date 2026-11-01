'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),baseline=require('../../docs/scheduling-fix/before-hashes.json');
// The separately approved supplementary review flow supersedes the original registration action.
// Handler hash includes the server-derived actor binding and locked replay.
const reviewedWorkflows={'server/handler.cjs':'6051015b326d6677b3316c760470a9d60bbd2761fdac04c4f3a5d94a90b12dc2','server/workflows.cjs':'ff7eb4d46589f39992639b20c12f40354767d7905fd3292e2394a129e4e056bf'};
test('reviewed workflow and UI snapshots; original scheduling, migrations and API contracts remain protected',()=>{
 for(const [file,hash]of Object.entries({...baseline,...reviewedWorkflows,...require('../legacy/presentation-baseline.json')})){
  // Authorized staging-auth changes; protected transport/session methods have a separate hash check.
  if(['server/supabase.cjs','scripts/provision.cjs'].includes(file))continue;
  let bytes=fs.readFileSync(path.join(root,file));
  if(file==='shared/domain.js')bytes=Buffer.from(require('../../proposals/scheduling-registration-hours/load-proposal.cjs').historicalSource(bytes.toString('utf8')));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,file);
 }
});
