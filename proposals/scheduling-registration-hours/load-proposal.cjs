'use strict';
// Historical comparison helper, never imported by the application or provisioning.
// The approved fix now runs directly from shared/domain.js.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const filename=path.resolve(__dirname,'../../shared/domain.js');
const previous='    if (!stats.isValid) {';
const approved='    if (stats.regHours < 20 || stats.regEvening < 2) {';
function historicalSource(source=fs.readFileSync(filename,'utf8')){
 if(source.split(approved).length!==2||source.includes(previous))throw new Error('Expected exactly the approved eligibility condition in main.');
 return source.replace(approved,previous);
}
function loadHistoricalOriginal(){
 const context={module:{exports:{}}};vm.runInNewContext(historicalSource(),context,{filename:'historical-unfixed-domain.js'});
 return context.module.exports;
}
function loadProposal(){return require(filename);}
module.exports={loadProposal,loadHistoricalOriginal,historicalSource};
