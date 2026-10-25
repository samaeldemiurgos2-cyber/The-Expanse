import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateScaleSource} from './scale-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=new Set(['/index.html','/expanse-data.json','/data/deck1.json','/walkthrough/index.html','/walkthrough/Textures/colormap.png','/assets/three.min.js','/assets/save-core.js','/assets/save-storage.js','/assets/save-session.js','/assets/save.css','/assets/navigation-target.js','/assets/navigation-console.js','/assets/navigation-console.css','/assets/orbital-position.js','/assets/survey-target.js','/assets/survey-console.js','/assets/survey-console.css','/assets/scale-math.js','/assets/scale-view.js','/assets/scale-flight.js','/tests/save-harness.html','/tests/scale-prototype.html','/tests/scale-prototype.js','/tests/scale-raster.js']);
http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let name;try{name=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);return res.end();}
 if(name==='/')name='/tests/scale-prototype.html';if(name==='/walkthrough/'||name==='/walkthrough')name='/walkthrough/index.html';
 if(name==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(name==='/tests/scale-source.html'){try{const s=generateScaleSource(root);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(req.method==='HEAD'?'':s);}catch(e){res.writeHead(500);return res.end(e.message);}}
 if(!files.has(name)){res.writeHead(404);return res.end();}
 const file=path.join(root,name),type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.png')?'image/png':'text/javascript; charset=utf-8';
 try{const stat=fs.statSync(file);res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size});if(req.method==='HEAD')return res.end();fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404);res.end();}
}).listen(4321,'127.0.0.1',()=>console.log('Isolated scale laboratory http://127.0.0.1:4321/'));
