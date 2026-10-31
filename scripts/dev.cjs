'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const handler=require('../api/[route].js');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['/','/index.html','/style.css','/app.js','/shared/domain.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const {securityHeaders}=require('../server/static.cjs');
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) return handler(req,res);
  securityHeaders(res);
  if(!['GET','HEAD'].includes(req.method)||!allowed.has(url.pathname)) {res.statusCode=404;return res.end('Not found');}
  const file=url.pathname==='/'?'/index.html':url.pathname;
  try {const content=await fs.readFile(path.join(root,file));res.setHeader('Content-Type',mime[path.extname(file)]);res.end(req.method==='HEAD'?undefined:content);}
  catch {res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`2CE: ${process.env.APP_ORIGIN||'http://localhost:4173'} (Supabase required)`));
