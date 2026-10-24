'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name+' missing');const brace=html.indexOf('{',start);let depth=0,quote=null,escape=false;for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}throw Error('Incomplete function');}
test('chart and interior load shared orbital and survey domains before session consumers',()=>{
 for(const file of ['index.html','walkthrough/index.html','tests/save-harness.html']){
  const source=fs.readFileSync(path.join(root,file),'utf8'),orb=source.indexOf('assets/orbital-position.js'),survey=source.indexOf('assets/survey-target.js'),session=source.indexOf('assets/save-session.js');
  assert.ok(orb>=0,'shared orbital script missing from '+file);assert.ok(survey>orb&&session>survey,'domain script order '+file);
 }
});
test('real chart orbiter placement delegates the same pure math without changing parent translation',()=>{
 const source=fn('updateSystem');assert.match(source,/ExpanseOrbital\.position/);
 const Orbital=require('../assets/orbital-position.js');
 const head=source.slice(0,source.indexOf('  for (i = 0; i < A.spinners.length; i++)'))+'}';
 for(const a of [0,.25,-Math.PI,2.9])for(const b of [0,Math.PI/2,-2.7]){
  const parent={x:7600*Math.cos(a),y:0,z:7600*Math.sin(a)},out=[];
  const B={anim:{orbiters:[{ang:b,r:590,incl:-.05851929216645658,speed:0,parent:{getWorldPosition(v){v.set(parent.x,parent.y,parent.z);}},node:{position:{set(...v){out.push(v);}}}}]}};
  const context={mode:'system',sysCurrent:'karna-vex',quality:'high',sysCache:{'karna-vex:high':B},ExpanseOrbital:Orbital,_lp:{set(x,y,z){Object.assign(this,{x,y,z});return this;}}};
  vm.runInNewContext('('+head+')(0,0)',context);
  const expected=[parent.x+590*Math.cos(b),parent.y+590*Math.sin(b)*Math.sin(-.05851929216645658),parent.z+590*Math.sin(b)*Math.cos(-.05851929216645658)];
  out[0].forEach((x,i)=>assert.ok(Math.abs(x-expected[i])<1e-9));
 }
});
test('dossier survey display uses visitor state and only the fixed target',()=>{
 const source=fn('renderSurveyDossier');
 const record={targetId:'karna-vex:moon:micqui-nobara',observedAt:'2026-10-23T10:00:00.000Z'};
 const child={textContent:'',remove(){host.child=null;}},host={child:null,querySelector(){return this.child;},append(n){this.child=n;}};
 const context={chartSaveSession:{snapshot:()=>({survey:record})},document:{createElement:()=>child},Date};
 const render=vm.runInNewContext('('+source+')',context);
 render('micqui-nobara',host);assert.equal(host.child,null,'raw identity cannot own a parent-qualified record');
 render('karna-vex:moon:micqui-nobara',host);assert.ok(host.child);
 assert.match(child.textContent,/survey/i);assert.match(child.textContent,/2026|10\/23/);
 render('karna-vex:moon:veyra',host);assert.equal(host.child,null);
 record.targetId='other';render('karna-vex:moon:micqui-nobara',host);assert.equal(host.child,null);
});

test('chart dossier identity qualifies the actual selected moon parent',()=>{
 const moons={'micqui-nobara':{def:{id:'micqui-nobara'},parent:{id:'karna-vex'}}};
 const qualify=vm.runInNewContext('('+fn('chartSurveyIdentity')+')',{moons});
 assert.equal(qualify('micqui-nobara'),'karna-vex:moon:micqui-nobara');
 moons['micqui-nobara'].parent.id='another-world';assert.equal(qualify('micqui-nobara'),'another-world:moon:micqui-nobara');
 assert.equal(qualify('toString'),null);assert.equal(qualify('karna-vex'),null);
});
test('only nearest interactive footprint opens, with Navigation winning an exact tie',()=>{
 const source=fs.readFileSync(path.join(root,'walkthrough/index.html'),'utf8');
 const start=source.indexOf('function bridgeNavigationEligibility('),end=source.indexOf('function bridgeNavigationIdentity(',start);
 assert.ok(start>=0&&end>start);const code=source.slice(start,end);
 const fixture={DECK:{bridge_pod_stations:[{id:'st_nav',rect:[-9.5,444.5,6,6]},{id:'st_ops',rect:[-12,460,6,6]}]},player:{x:-3,z:461},propsReady:true,inputPaused:false,
  interiorSession:{status:()=>({code:'saved'})},stationWorldRect:x=>x.rect,parentRoomAt:()=>({id:'bridge_pod'}),interiorPositionIsValid:()=>true,
  document:{getElementById:()=>({classList:{contains:()=>true}}),querySelector:()=>null},onboarding:{classList:{contains:()=>true}}};
 const eligible=vm.runInNewContext('('+code+')',fixture);
 assert.equal(eligible('st_ops').station.id,'st_ops');assert.equal(eligible('st_ops').eligible,true);assert.equal(eligible().eligible,false);
 fixture.player.x=-6;fixture.player.z=455.25;assert.equal(eligible().eligible,true);assert.equal(eligible('st_ops').eligible,false);
 fixture.player.z=456;assert.equal(eligible('st_ops').eligible,true);assert.equal(eligible().eligible,false);
 fixture.interiorPositionIsValid=()=>false;assert.equal(eligible('st_ops').eligible,false);
});
