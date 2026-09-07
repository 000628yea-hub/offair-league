const http=require('http'),fs=require('fs'),p=require('path');
const types={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer((q,s)=>{
  let f=decodeURIComponent(q.url.split('?')[0]); if(f==='/')f='/index.html';
  const fp=p.join(__dirname,f);
  fs.readFile(fp,(e,d)=>{ if(e){s.statusCode=404;return s.end('404');} s.setHeader('content-type',types[p.extname(fp)]||'text/plain'); s.setHeader('cache-control','no-store'); s.end(d); });
}).listen(8777,()=>console.log('serving on http://localhost:8777'));
