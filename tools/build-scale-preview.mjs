import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateScaleSource} from './scale-source.mjs';

function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw new Error('Public preview seam must occur exactly once: '+from);
 return source.replace(from,to);
}

export function buildScalePreview(root,output=path.join(root,'scale')){
 let html=fs.readFileSync(path.join(root,'tests/scale-prototype.html'),'utf8');
 html=replaceOnce(html,'<base href="/tests/">','<base href="./">');
 html=replaceOnce(html,'<title>The Expanse · isolated scale laboratory</title>','<title>The Expanse · Public Scale Preview</title>');
 html=replaceOnce(html,'<h1>The Expanse · scale laboratory</h1>','<h1>The Expanse · Public Scale Preview</h1>');
 html=replaceOnce(html,'Isolated engineering proof · current live release unchanged','Public Scale Preview · separate from the main navigation · <a href="../" target="_blank" rel="noopener noreferrer">Open current app in a new tab</a>');
 const script=replaceOnce(fs.readFileSync(path.join(root,'tests/scale-prototype.js'),'utf8'),"iframe.src='/tests/scale-source.html'","iframe.src='./scale-source.html'");
 const files={
  'index.html':html,
  'scale-prototype.js':script,
  'scale-raster.js':fs.readFileSync(path.join(root,'tests/scale-raster.js'),'utf8'),
  'scale-source.html':generateScaleSource(root,'../')
 };
 // Fail before writing if a generated artifact leaks a machine path or relies on
 // the private laboratory server's root-relative test/asset routes.
 for(const [name,text] of Object.entries(files)){
  if(/(?<![A-Za-z0-9])[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home)\/|(?:["'=])\/(?:tests|assets)\//i.test(text))throw new Error('Non-portable public artifact: '+name);
 }
 fs.mkdirSync(output,{recursive:true});
 for(const [name,text] of Object.entries(files))fs.writeFileSync(path.join(output,name),text,'utf8');
 return Object.keys(files);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 console.log('Built scale/: '+buildScalePreview(root).join(', '));
}
