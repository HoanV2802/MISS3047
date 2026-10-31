'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const files=['index.html','style.css','app.js','shared/domain.js'];
  // Read every input before replacing this project's generated output directory.
  const contents=await Promise.all(files.map(file=>fs.readFile(path.join(root,file))));
  await fs.rm(path.join(root,'public'),{recursive:true,force:true});
  for(const [index,file] of files.entries()){
    const output=path.join(root,'public',file);
    await fs.mkdir(path.dirname(output),{recursive:true});
    await fs.writeFile(output,contents[index]);
  }
})().catch(error=>{console.error(error.message);process.exit(1);});
