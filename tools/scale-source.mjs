import fs from 'node:fs';
import path from 'node:path';

export function generateScaleSource(root,baseHref='/'){
 let s=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const replacements=[
  ['ship.add(m); return m;','if (!m.userData.expanseRole) m.userData.expanseRole="physical"; ship.add(m); return m;'],
  ['s.scale.set(sc, sc, 1);','s.userData.expanseRole="effect"; s.scale.set(sc, sc, 1);'],
  ['buildBackdrop(B.scene);','var _skyStart=B.scene.children.length; buildBackdrop(B.scene); B.scene.children.slice(_skyStart).forEach(function(o){o.userData.expanseRole="backdrop";});'],
  ['belt.setMatrixAt(i, m4);','if(!belt.userData.expanseMatrices)belt.userData.expanseMatrices=[];belt.userData.expanseMatrices.push(m4.elements.slice());belt.setMatrixAt(i, m4);'],
  ['cm.tail = tail; cm.geo = g; cm.cpos = cpos;','cm.tail = tail; cm.geo = g; cm.cpos = cpos; tail.userData.expanseHistory=cm.hist;'],
  ['/* Keep HUD panels clear when controls wrap, fonts load, or system mode changes. */','window.__scaleSource={ship:ship,build:assembleSystem};\n/* Keep HUD panels clear when controls wrap, fonts load, or system mode changes. */']
 ];
 for(const [from,to] of replacements){if(!s.includes(from))throw Error('Source probe seam changed: '+from);s=s.replace(from,to);}
 const start=s.indexOf('function updateSystem(dt, t){'),end=s.indexOf('/* --------------------- system selection & readout',start);
 const original=s.slice(start,end),body=original.slice(original.indexOf('  var A = B.anim'));
 const tick='function tickScaleSource(B,dt,t,pausePhases){\n'+body.replace('o.ang += o.speed * dt;','o.ang += o.speed * dt * (pausePhases?0:1e-6);');
 s=s.replace('window.__scaleSource={ship:ship,build:assembleSystem};',tick+'\nwindow.__scaleSource={ship:ship,build:assembleSystem,tick:tickScaleSource,post:{composite:compMat,blurH:blurHMat,blurV:blurVMat}};');
 s=s.replace('startChartSaveSession().catch(function(error){','Promise.resolve().catch(function(error){');
 s=s.replace('requestAnimationFrame(function(now){ _last = now; requestAnimationFrame(loop); });','/* Isolated source builder: no background render or save loop. */');
 // r128 identifies index-buffer types with instanceof. Share the parent's exact
 // engine realm; foreign Uint16Array indices otherwise become invalid GL_FLOAT.
 s=s.replace(/<script src="data:application\/javascript;base64,[^"]+"><\/script>/,'<script>window.THREE=parent.THREE;</script>');
 // Resolve original relative assets without modifying any source file.
 return s.replace('<head>','<head><base href="'+baseHref+'">');
}
