(function (root) {
  'use strict';
  const C=root.ExpanseSaveCore,S=root.ExpanseSaveStorage;
  const err=(code,message)=>new C.SaveError(code,message);
  const signature=value=>JSON.stringify({navigation:value.navigation,interior:value.interior,preferences:value.preferences,lastView:value.lastView,survey:value.survey});
  function originalJSON(value){
    try{return JSON.stringify(value,null,2);}catch(_){
      const seen=new WeakMap();
      function diagnostic(item,path,depth){
        if(depth>64)return {type:'depth-limit',path};
        if(typeof item==='bigint')return {type:'bigint',value:item.toString()};
        if(item===undefined)return {type:'undefined'};
        if(item===null||typeof item!=='object')return item;
        if(seen.has(item))return {type:'reference',path:seen.get(item)};
        seen.set(item,path);
        if(item instanceof Map)return {type:'map',entries:Array.from(item,([k,v],i)=>[diagnostic(k,path+'/key'+i,depth+1),diagnostic(v,path+'/value'+i,depth+1)])};
        if(item instanceof Set)return {type:'set',values:Array.from(item,(v,i)=>diagnostic(v,path+'/'+i,depth+1))};
        return {type:Array.isArray(item)?'array':'object',entries:Object.keys(item).map(key=>[key,diagnostic(item[key],path+'/'+key,depth+1)])};
      }
      return JSON.stringify({format:'the-expanse/original-diagnostic',notice:'Non-JSON stored data is tagged for diagnosis; this is not an importable journey save.',value:diagnostic(value,'$',0)},null,2);
    }
  }
  function download(text,name) {
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function start(options) {
    const {adapter,view}=options;
    if(!['chart','interior'].includes(view))throw err('INVALID','Unknown renderer');
    const base=new URL('./',options.baseURL);
    const defaults=C.merge(C.fresh(),adapter.capture());
    let state=C.merge(defaults,{lastView:view}),repo=null,raw=null,previous=null,expected=0,checkpointValue=null;
    let busy=false,blocked=false,hardBlocked=false,memory=false,memoryChosen=false,ready=false,lastTick=0,lastWritten='',pendingRoute=null,navLease=null,leaseSequence=0;
    let statusValue={code:'loading',message:'Loading local save…'};
    let statusNode,dialog,saveButton,originalButton,recoveryButton,continueButton,panelStable=false;
    function pause(value){adapter.pause(!!value||!!navLease||!!(dialog&&dialog.open));}
    function settled(){return navLease?navLease.stable:(dialog&&dialog.open?panelStable:adapter.stable());}
    function validPrevious(){try{return previous!==null&&!!C.validate(previous);}catch(_){return false;}}
    pause(true);
    function status(code,message) {
      statusValue={code,message};
      if(statusNode){statusNode.textContent=message;statusNode.dataset.state=code;}
      if(saveButton){saveButton.title=message;saveButton.dataset.state=code;}
      if(originalButton)originalButton.hidden=raw===null;
      if(recoveryButton)recoveryButton.hidden=!validPrevious();
      if(continueButton)continueButton.hidden=!pendingRoute;
      if(hardBlocked&&dialog&&!dialog.open&&!navLease){panelStable=false;dialog.showModal();if(originalButton&&!originalButton.hidden)originalButton.focus();}
      return statusValue;
    }
    function capture(lastView) {
      let page=adapter.capture();
      // The ship adapter owns only aboard pose/preferences; exterior navigation belongs to this session.
      if(view==='interior'&&Object.prototype.hasOwnProperty.call(page,'navigation')){page={...page};delete page.navigation;}
      return C.merge(state,{...page,lastView:lastView||view});
    }
    function noNavigationLease(){if(navLease)throw err('BUSY','Close the bridge console before using another save operation.');}
    function assertLease(lease){if(!lease||!lease.active||navLease!==lease)throw err('STALE','This navigation console is no longer active.');}
    function available() {
      noNavigationLease();
      if(busy||!ready||!settled())throw err('BUSY','Wait until movement/scene transition or save operation has settled.');
      if(blocked)throw err('BLOCKED','Resolve this save error using Retry, recovery or New journey before saving.');
    }
    function recoveryAvailable(){
      noNavigationLease();
      if(busy||!ready)throw err('BUSY','Wait for the current operation.');
      if(!hardBlocked&&!settled())throw err('BUSY','Wait for warp or scene transition to finish before recovery.');
    }
    function failure(error,keepPaused) {
      if(error.code==='CONFLICT'){blocked=true;status('conflict',error.message);}
      else if(error.code==='UNAVAILABLE'){memory=true;status('memory','Memory only — '+error.message);}
      else status('error',error.message||'Save operation failed; old checkpoint retained.');
      if(!keepPaused)pause(false);
    }
    async function load() {
      pause(true);blocked=false;hardBlocked=false;memoryChosen=false;status('loading','Loading local save…');
      try {
        if(repo)repo.close();repo=await S.open(base);memory=false;
        const records=await repo.read();raw=records.current;previous=records.previous;
        expected=raw===null?0:raw&&Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:null;
        const loaded=raw===null?C.merge(defaults,{lastView:view}):C.validate(raw);
        checkpointValue=raw===null?null:{revision:loaded.revision,savedAt:loaded.savedAt};
        await adapter.validate(loaded);await adapter.apply(loaded);state=loaded;
        lastWritten=raw===null?'':signature(loaded);
        ready=true;pause(false);if(dialog&&dialog.open)panelStable=true;
        status(raw===null?'unsaved':'saved',raw===null?'Unsaved — new journey':('Saved at '+new Date(loaded.savedAt).toLocaleTimeString()+' · resumed stationary'));
      } catch(error) {
        ready=true;
        if(error.code==='UNAVAILABLE'){
          memory=true;pause(false);if(dialog&&dialog.open)panelStable=true;status('memory','Memory only — browser storage unavailable. Export JSON for a backup.');
        } else {
          blocked=true;hardBlocked=true;pause(true);status('error','Save not restored: '+error.message+'. Original retained; choose recovery or New journey.');
          if(dialog&&!dialog.open){panelStable=false;dialog.showModal();if(originalButton&&!originalButton.hidden)originalButton.focus();}
        }
      }
    }
    async function persist(candidate,recovery) {
      if(memory||!repo)throw err('UNAVAILABLE','No automatic persistence here. Export JSON or Retry storage.');
      const saved=await (recovery?repo.replace(candidate,expected):repo.commit(candidate,expected));
      previous=raw===null?previous:(()=>{try{return C.validate(raw);}catch(_){return previous;}})();
      state=saved;raw=saved;expected=saved.revision;lastWritten=signature(saved);pendingRoute=null;
      checkpointValue={revision:saved.revision,savedAt:saved.savedAt};
      status('saved','Saved at '+new Date(saved.savedAt).toLocaleTimeString());
      return C.validate(saved);
    }
    async function checkpoint() {
      available();const candidate=capture();busy=true;let validated=false;
      try{await adapter.validate(candidate);validated=true;status('saving','Saving…');return await persist(candidate,false);}
      catch(e){if(validated)state=candidate;failure(e,false);throw e;}
      finally{busy=false;}
    }
    function tick() {
      if(!ready||busy||blocked||navLease||(dialog&&dialog.open)||!adapter.stable()||performance.now()-lastTick<2000)return;
      lastTick=performance.now();
      try{
        const next=capture();state=next;
        if(signature(next)===lastWritten)return;
        if(memory){status('memory','Memory only — changes need Export JSON.');return;}
        status('unsaved','Unsaved changes');checkpoint().catch(e=>{if(e.code!=='BUSY')failure(e,false);});
      }catch(e){failure(e,false);}
    }
    function exportJSON() {
      noNavigationLease();
      if(ready&&!busy&&settled())state=capture();
      else if(hardBlocked)status('error','No journey was restored. This export contains safe defaults, not the unreadable journey. Use Export original to preserve the stored record, then choose recovery.');
      else status(blocked||busy?statusValue.code:'unsaved','Exported the preceding stable snapshot; the current transition or save is not included.'+(blocked?' Resolve the save error using recovery.':''));
      return C.stringify(state);
    }
    function route(target) {
      // Imported records and return query strings have no destination authority.
      return new URL(target==='interior'?'walkthrough/index.html':'index.html',base).href;
    }
    async function handoff(target) {
      if(!['chart','interior'].includes(target))throw err('INVALID','Unknown handoff');
      available();const destination=route(target);
      busy=true;pause(true);let candidate,validated=false;
      try{candidate=capture(target);await adapter.validate(candidate);validated=true;pendingRoute=destination;status('saving','Saving before changing view…');await persist(candidate,false);location.assign(destination);}
      catch(e){if(validated)state=candidate;failure(e,false);throw e;}
      finally{busy=false;}
    }
    async function importJSON(text) {
      noNavigationLease();
      const candidate=C.parse(text); // Reject size/schema before touching live state.
      available();const before=capture();busy=true;pause(true);let applyStarted=false;
      try {
        await adapter.validate(candidate);status('loading','Applying imported save…');applyStarted=true;
        await adapter.apply(candidate);
        if(memory){state=C.validate({...candidate,revision:state.revision,savedAt:state.savedAt});status('memory','Imported on this page only — memory mode cannot resume across pages.');}
        else await persist(candidate,false);
      } catch(e) {
        try{if(applyStarted)await adapter.apply(before);}catch(rollback){blocked=true;hardBlocked=true;status('error','Import rollback failed. Reload; durable checkpoint was not intentionally replaced.');throw rollback;}
        state=before;failure(e,false);throw e;
      } finally {busy=false;pause(hardBlocked);}
      return C.validate(state);
    }
    async function replaceWith(candidate,message) {
      recoveryAvailable();
      const before=!hardBlocked&&settled()?capture():C.validate(state);busy=true;pause(true);let applyStarted=false;
      try{
        await adapter.validate(candidate);applyStarted=true;
        await adapter.apply(candidate);
        if(memory){state=C.validate(candidate);blocked=false;hardBlocked=false;status('memory',message+' in memory only. Export a backup.');}
        else {await persist(candidate,true);blocked=false;hardBlocked=false;}
      }catch(e){
        try{if(applyStarted)await adapter.apply(before);}catch(rollback){blocked=true;hardBlocked=true;status('error','Recovery rollback failed. Reload before continuing; automatic saves are blocked.');throw rollback;}
        state=before;failure(e,blocked);throw e;
      }
      finally{busy=false;pause(hardBlocked);if(!blocked&&dialog&&dialog.open)panelStable=true;}
      return C.validate(state);
    }
    async function recoverPrevious() {
      noNavigationLease();
      if(previous===null)throw err('INVALID','No previous checkpoint is available.');
      return replaceWith(C.validate(previous),'Previous checkpoint recovered');
    }
    async function newJourney() {
      return replaceWith(C.merge(defaults,{lastView:view}),'New journey started');
    }
    async function retry() {
      recoveryAvailable();
      busy=true;try{await load();}finally{busy=false;}
    }
    function continueWithoutSaving() {
      noNavigationLease();
      if(busy)throw err('BUSY','Wait for the current save operation.');
      if(!pendingRoute)throw err('INVALID','No pending view change.');
      const destination=pendingRoute;pendingRoute=null;location.assign(destination);
    }
    function useMemoryOnly() {
      noNavigationLease();
      if(busy)throw err('BUSY','Wait for the current save operation.');
      pendingRoute=null;memory=true;memoryChosen=true;blocked=false;hardBlocked=false;pause(false);if(dialog&&dialog.open)panelStable=true;status('memory','Memory only — original browser save retained. Export JSON before leaving.');
    }
    function catalogIdentity(lease,id) {
      if(typeof id!=='string')return null;
      const world=lease.catalog&&lease.catalog.worlds.find(item=>item.id===id);
      return {id,name:world?world.name:id};
    }
    function navigationModel(lease) {
      assertLease(lease);
      const snapshot=capture(),nav=snapshot.navigation;
      const targetId=!nav?null:nav.frame==='chart-mly'?nav.selection:nav.chartReturn.selection;
      const systemId=nav&&nav.frame==='system-1000km'?nav.systemId:null;
      const bodyId=nav&&nav.frame==='system-1000km'?nav.selection:null;
      return {
        snapshot,
        status:{...statusValue},
        busy:!!lease.busy,
        catalog:{status:lease.catalogStatus,error:lease.catalogError,
          worlds:lease.catalog?lease.catalog.worlds.map(item=>({id:item.id,name:item.name})):[]},
        readableIdentities:{chartTarget:catalogIdentity(lease,targetId),system:catalogIdentity(lease,systemId),
          localBody:typeof bodyId==='string'?{id:bodyId,label:bodyId}:null},
        checkpoint:checkpointValue?{revision:checkpointValue.revision,savedAt:checkpointValue.savedAt}:null
      };
    }
    function catalogRequest(lease) {
      assertLease(lease);
      lease.catalogStatus='loading';lease.catalogError=null;lease.catalog=null;
      const request=Promise.resolve().then(()=>{
        assertLease(lease);
        const target=lease.kind==='survey'?root.ExpanseSurvey:root.ExpanseNavigationTarget;
        if(!target||typeof target.load!=='function')throw err('UNAVAILABLE','The chart catalog loader is unavailable.');
        return target.load(base);
      }).then(catalog=>{
        assertLease(lease);
        lease.catalog=catalog;lease.catalogStatus='ready';lease.catalogError=null;
        return lease.kind==='survey'?catalog.target:catalog.worlds.map(item=>({id:item.id,name:item.name}));
      }).catch(error=>{
        if(lease.active&&navLease===lease){lease.catalog=null;lease.catalogStatus='error';lease.catalogError=error.message||'Catalog could not be loaded.';}
        throw error;
      });
      lease.catalogPromise=request;
      return request;
    }
    async function retryCatalog(lease) {
      assertLease(lease);
      if(busy||lease.busy)throw err('BUSY','Wait for destination validation and save to finish.');
      if(lease.catalogStatus==='loading')throw err('BUSY','The catalog request is already in progress.');
      if(lease.catalogStatus==='ready')return lease.kind==='survey'?lease.catalog.target:lease.catalog.worlds.map(item=>({id:item.id,name:item.name}));
      return catalogRequest(lease);
    }
    async function closeNavigation(lease) {
      assertLease(lease);
      if(busy||lease.busy)throw err('BUSY','Wait for destination validation and save to finish before closing.');
      // Clear keyboard, pointer and touch state while this lease still owns the pause.
      adapter.pause(true);
      lease.active=false;
      navLease=null;
      pause(false);
    }
    async function setChartTarget(lease,worldId) {
      assertLease(lease);
      if(blocked||hardBlocked||statusValue.code==='conflict'||statusValue.code==='error')throw err('BLOCKED','Resolve the save error before setting another destination.');
      if(busy||lease.busy)throw err('BUSY','A destination update is already in progress.');
      if(lease.catalogStatus==='loading')throw err('BUSY','Wait for the chart catalog to load.');
      if(lease.catalogStatus!=='ready'||!lease.catalog)throw err('UNAVAILABLE',lease.catalogError||'The chart catalog is unavailable.');
      busy=true;lease.busy=true;
      let before,candidate;
      try {
        before=capture();
        state=before;
        candidate=root.ExpanseNavigationTarget.patch(before,worldId,lease.catalog);
      } catch(error) {
        busy=false;lease.busy=false;
        return Promise.reject(error);
      }
      return (async()=>{
        try {
          status('validating','Validating destination…');
          await adapter.validate(candidate);
          assertLease(lease);
          if(memory||!repo){
            assertLease(lease);
            state=candidate;
            status('memory','This page only — export JSON before leaving.');
            return C.validate(state);
          }
          assertLease(lease);
          status('saving','Saving destination…');
          assertLease(lease);
          return await persist(candidate,false);
        } catch(error) {
          state=before;
          failure(error,true);
          throw error;
        } finally {
          busy=false;lease.busy=false;
          if(lease.active&&navLease===lease)pause(false);
        }
      })();
    }
    function openConsoleLease(kind) {
      if(view!=='interior')throw err('INVALID','The navigation console is available only aboard the ship.');
      if(!ready||busy||navLease||(dialog&&dialog.open))throw err('BUSY','Close other operations and wait until the ship is settled.');
      if(blocked||hardBlocked||['loading','saving','error','conflict'].includes(statusValue.code))throw err('BLOCKED','Resolve the save error before opening the navigation console.');
      const stable=adapter.stable();
      if(!stable)throw err('BUSY','Wait until the ship and current interaction are settled.');
      const lease={id:++leaseSequence,kind,active:true,stable:!!stable,busy:false,catalogStatus:'idle',catalogError:null,catalog:null,catalogPromise:null};
      navLease=lease;
      try{pause(true);}catch(error){lease.active=false;navLease=null;throw error;}
      lease.catalogStatus='loading';
      catalogRequest(lease).catch(()=>{});
      return lease;
    }
    function openNavigationConsole() {
      const lease=openConsoleLease('navigation');
      return Object.freeze({
        readModel:()=>navigationModel(lease),
        setChartTarget:worldId=>setChartTarget(lease,worldId),
        close:()=>closeNavigation(lease),
        retryCatalog:()=>retryCatalog(lease)
      });
    }
    function surveyModel(lease) {
      assertLease(lease);
      const snapshot=capture(),record=snapshot.survey||null;
      let range={eligible:false,reason:lease.catalogError||'Wait for the survey catalog.',centerDistance:null,clearance:null,radius:null,maxClearance:null,units:'system-1000km'};
      if(lease.catalogStatus==='ready'){
        try{range=root.ExpanseSurvey.evaluate(snapshot.navigation,lease.catalog);}
        catch(error){range={...range,reason:error.message||'Exterior observation context is invalid.'};}
      }
      let recordDurable=false;
      if(record&&raw!==null){
        try{const saved=C.validate(raw).survey;recordDurable=!!saved&&saved.targetId===record.targetId&&saved.observedAt===record.observedAt;}catch(_){}
      }
      return {snapshot,status:{...statusValue},busy:!!lease.busy,
        catalog:{status:lease.catalogStatus,error:lease.catalogError},
        target:lease.catalog?{...lease.catalog.target}:null,range,record,recordDurable,memoryChoiceRequired:memory&&!memoryChosen,
        checkpoint:checkpointValue?{...checkpointValue}:null};
    }
    async function recordSurvey(lease) {
      assertLease(lease);
      if(blocked||hardBlocked||statusValue.code==='conflict'||statusValue.code==='error')throw err('BLOCKED','Resolve the save error before recording a survey.');
      if(busy||lease.busy)throw err('BUSY','Wait for the current survey operation.');
      if(state.survey)return C.validate(state);
      if(memory&&!memoryChosen)throw err('BLOCKED','Close Sensors, then choose Save → Use memory only (or Retry storage) before recording on this page.');
      if(lease.catalogStatus==='loading')throw err('BUSY','Wait for the survey catalog.');
      if(lease.catalogStatus!=='ready'||!lease.catalog)throw err('UNAVAILABLE',lease.catalogError||'Survey catalog unavailable.');
      busy=true;lease.busy=true;
      let before,candidate;
      try{before=capture();state=before;candidate=root.ExpanseSurvey.patch(before,lease.catalog,new Date().toISOString());}
      catch(error){busy=false;lease.busy=false;throw error;}
      try{
        status('validating','Validating survey range…');
        await adapter.validate(candidate);assertLease(lease);
        if(memory||!repo){
          state=candidate;status('memory','Survey recorded on this page only — close Sensors and export JSON before leaving.');
          return C.validate(state);
        }
        status('saving','Saving survey…');return await persist(candidate,false);
      }catch(error){state=before;failure(error,true);throw error;}
      finally{busy=false;lease.busy=false;if(lease.active&&navLease===lease)pause(false);}
    }
    function openSurveyConsole() {
      const lease=openConsoleLease('survey');
      return Object.freeze({readModel:()=>surveyModel(lease),recordSurvey:()=>recordSurvey(lease),
        retryCatalog:()=>retryCatalog(lease),close:()=>closeNavigation(lease)});
    }
    function surveyReplacementWarning(candidate){
      return state.survey&&(!candidate||!candidate.survey)?' This removes the recorded Micqui-Nobara survey.':'';
    }
    const session=Object.freeze({tick,checkpoint,handoff,importJSON,exportJSON,recoverPrevious,newJourney,retry,continueWithoutSaving,useMemoryOnly,openNavigationConsole,openSurveyConsole,
      snapshot:()=>C.validate(state),status:()=>({...statusValue}),
      exportOriginal:()=>raw===null?null:originalJSON(raw)});
    function controls() {
      const host=options.host||document.body;
      saveButton=document.createElement('button');saveButton.type='button';saveButton.className='expanse-save-button';saveButton.id='save-control';saveButton.textContent='Save';saveButton.setAttribute('aria-haspopup','dialog');
      dialog=document.createElement('dialog');dialog.className='expanse-save-panel';dialog.id='save-panel';dialog.setAttribute('aria-labelledby','save-heading');
      const nativeShowModal=dialog.showModal.bind(dialog);
      dialog.showModal=function(){noNavigationLease();return nativeShowModal();};
      const heading=document.createElement('h2');heading.id='save-heading';heading.textContent='Local journey save';dialog.append(heading);
      statusNode=document.createElement('p');statusNode.id='save-status';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');dialog.append(statusNode);
      const note=document.createElement('p');note.textContent='Browser-local, not cloud sync. Resume is stationary. Export JSON for a portable backup. Import, recovery and New journey replace progress only after confirmation.';dialog.append(note);
      const row=document.createElement('div');row.className='expanse-save-actions';dialog.append(row);
      function button(label,action){
        const element=document.createElement('button');element.type='button';element.textContent=label;
        element.addEventListener('click',()=>{Promise.resolve().then(action).catch(e=>{if(e.code!=='BUSY')failure(e,blocked);else if(!navLease)status('unsaved',e.message);});});row.append(element);return element;
      }
      button('Save now',checkpoint);
      button('Export JSON',()=>download(exportJSON(),'the-expanse-save.json'));
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.id='save-import-file';
      const label=document.createElement('label');label.htmlFor=input.id;label.textContent='Choose JSON backup';dialog.append(label,input);
      button('Import JSON',async()=>{
        const file=input.files[0];if(!file)throw err('INVALID','Choose a JSON backup first.');
        if(file.size>C.MAX_BYTES)throw err('SIZE','Import exceeds 256 KiB.');
        const text=await file.text();const parsed=C.parse(text);
        if(!confirm('Replace current progress with this backup? Cancel to Export JSON first.'+surveyReplacementWarning(parsed)))return;
        await importJSON(text);input.value='';
      });
      function replacementWarning(){try{if(raw!==null)C.validate(raw);return '';}catch(_){return ' The unreadable original will be permanently replaced. Cancel and use Export original first.';}}
      originalButton=button('Export original',()=>{const text=session.exportOriginal();if(text!==null)download(text,'the-expanse-original.json');});
      recoveryButton=button('Recover previous',async()=>{if(confirm('Replace current progress with the previous checkpoint? Cancel to export a backup first.'+replacementWarning()+surveyReplacementWarning(previous===null?null:C.validate(previous))))await recoverPrevious();});
      button('New journey',async()=>{if(confirm('Start a new journey and replace this app’s current save? Cancel to Export JSON first.'+replacementWarning()+surveyReplacementWarning(null)))await newJourney();});
      button('Retry / reload saved',async()=>{if(confirm('Reload browser checkpoint? Unsaved changes will be lost. Cancel to export first.'))await retry();});
      button('Use memory only',()=>{if(confirm('Continue without automatic saving? Existing browser records stay untouched; export before leaving.'))useMemoryOnly();});
      continueButton=button('Continue without saving',()=>{if(confirm('Change view WITHOUT saving? Cross-page progress may be lost.'))continueWithoutSaving();});
      button('Close',()=>dialog.close());
      saveButton.addEventListener('click',()=>{
        if(navLease)return;
        panelStable=ready&&!busy&&adapter.stable();dialog.showModal();pause(true);dialog.querySelector('button').focus();
      });
      dialog.addEventListener('close',()=>{pendingRoute=null;pause(busy||hardBlocked);status(statusValue.code,statusValue.message);saveButton.focus();});
      host.append(saveButton);document.body.append(dialog);
      // Live status remains announced even when the modal is closed.
      const live=document.createElement('span');live.className='expanse-save-live';live.setAttribute('role','status');live.setAttribute('aria-live','polite');host.append(live);
      const observer=new MutationObserver(()=>{live.textContent=statusNode.textContent;});observer.observe(statusNode,{childList:true,characterData:true,subtree:true});
      status(statusValue.code,statusValue.message);
    }
    controls();root.__expanseSave=session;
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ready&&!busy&&!blocked&&!navLease&&adapter.stable())checkpoint().catch(()=>{});});
    root.addEventListener('pagehide',()=>{if(ready&&!busy&&!blocked&&!navLease&&adapter.stable())checkpoint().catch(()=>{});});
    await load();return session;
  }
  root.ExpanseSave=Object.freeze({start});
})(globalThis);
