(function (root) {
  'use strict';
  const C=root.ExpanseSaveCore,S=root.ExpanseSaveStorage;
  const err=(code,message)=>new C.SaveError(code,message);
  const signature=value=>JSON.stringify({navigation:value.navigation,interior:value.interior,preferences:value.preferences,lastView:value.lastView});
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
    let state=C.merge(defaults,{lastView:view}),repo=null,raw=null,previous=null,expected=0;
    let busy=false,blocked=false,hardBlocked=false,memory=false,ready=false,lastTick=0,lastWritten='',pendingRoute=null;
    let statusValue={code:'loading',message:'Loading local save…'};
    let statusNode,dialog,saveButton,originalButton,recoveryButton,continueButton,panelStable=false;
    function pause(value){adapter.pause(value||!!(dialog&&dialog.open));}
    function settled(){return dialog&&dialog.open?panelStable:adapter.stable();}
    function validPrevious(){try{return previous!==null&&!!C.validate(previous);}catch(_){return false;}}
    pause(true);
    function status(code,message) {
      statusValue={code,message};
      if(statusNode){statusNode.textContent=message;statusNode.dataset.state=code;}
      if(saveButton){saveButton.title=message;saveButton.dataset.state=code;}
      if(originalButton)originalButton.hidden=raw===null;
      if(recoveryButton)recoveryButton.hidden=!validPrevious();
      if(continueButton)continueButton.hidden=!pendingRoute;
      if(hardBlocked&&dialog&&!dialog.open){panelStable=false;dialog.showModal();if(originalButton&&!originalButton.hidden)originalButton.focus();}
      return statusValue;
    }
    function capture(lastView) {
      return C.merge(state,{...adapter.capture(),lastView:lastView||view});
    }
    function available() {
      if(busy||!ready||!settled())throw err('BUSY','Wait until movement/scene transition or save operation has settled.');
      if(blocked)throw err('BLOCKED','Resolve this save error using Retry, recovery or New journey before saving.');
    }
    function recoveryAvailable(){
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
      pause(true);blocked=false;hardBlocked=false;status('loading','Loading local save…');
      try {
        if(repo)repo.close();repo=await S.open(base);memory=false;
        const records=await repo.read();raw=records.current;previous=records.previous;
        expected=raw===null?0:raw&&Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:null;
        const loaded=raw===null?C.merge(defaults,{lastView:view}):C.validate(raw);
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
      if(!ready||busy||blocked||(dialog&&dialog.open)||!adapter.stable()||performance.now()-lastTick<2000)return;
      lastTick=performance.now();
      try{
        const next=capture();state=next;
        if(signature(next)===lastWritten)return;
        if(memory){status('memory','Memory only — changes need Export JSON.');return;}
        status('unsaved','Unsaved changes');checkpoint().catch(e=>{if(e.code!=='BUSY')failure(e,false);});
      }catch(e){failure(e,false);}
    }
    function exportJSON() {
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
      if(!pendingRoute)throw err('INVALID','No pending view change.');
      const destination=pendingRoute;pendingRoute=null;location.assign(destination);
    }
    function useMemoryOnly() {
      pendingRoute=null;memory=true;blocked=false;hardBlocked=false;pause(false);if(dialog&&dialog.open)panelStable=true;status('memory','Memory only — original browser save retained. Export JSON before leaving.');
    }
    const session=Object.freeze({tick,checkpoint,handoff,importJSON,exportJSON,recoverPrevious,newJourney,retry,continueWithoutSaving,useMemoryOnly,
      snapshot:()=>C.validate(state),status:()=>({...statusValue}),
      exportOriginal:()=>raw===null?null:originalJSON(raw)});
    function controls() {
      const host=options.host||document.body;
      saveButton=document.createElement('button');saveButton.type='button';saveButton.className='expanse-save-button';saveButton.id='save-control';saveButton.textContent='Save';saveButton.setAttribute('aria-haspopup','dialog');
      dialog=document.createElement('dialog');dialog.className='expanse-save-panel';dialog.id='save-panel';dialog.setAttribute('aria-labelledby','save-heading');
      const heading=document.createElement('h2');heading.id='save-heading';heading.textContent='Local journey save';dialog.append(heading);
      statusNode=document.createElement('p');statusNode.id='save-status';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');dialog.append(statusNode);
      const note=document.createElement('p');note.textContent='Browser-local, not cloud sync. Resume is stationary. Export JSON for a portable backup. Import, recovery and New journey replace progress only after confirmation.';dialog.append(note);
      const row=document.createElement('div');row.className='expanse-save-actions';dialog.append(row);
      function button(label,action){
        const element=document.createElement('button');element.type='button';element.textContent=label;
        element.addEventListener('click',()=>{Promise.resolve().then(action).catch(e=>{if(e.code!=='BUSY')failure(e,blocked);else status('unsaved',e.message);});});row.append(element);return element;
      }
      button('Save now',checkpoint);
      button('Export JSON',()=>download(exportJSON(),'the-expanse-save.json'));
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.id='save-import-file';
      const label=document.createElement('label');label.htmlFor=input.id;label.textContent='Choose JSON backup';dialog.append(label,input);
      button('Import JSON',async()=>{
        const file=input.files[0];if(!file)throw err('INVALID','Choose a JSON backup first.');
        if(file.size>C.MAX_BYTES)throw err('SIZE','Import exceeds 256 KiB.');
        const text=await file.text();C.parse(text);
        if(!confirm('Replace current progress with this backup? Cancel to Export JSON first.'))return;
        await importJSON(text);input.value='';
      });
      function replacementWarning(){try{if(raw!==null)C.validate(raw);return '';}catch(_){return ' The unreadable original will be permanently replaced. Cancel and use Export original first.';}}
      originalButton=button('Export original',()=>{const text=session.exportOriginal();if(text!==null)download(text,'the-expanse-original.json');});
      recoveryButton=button('Recover previous',async()=>{if(confirm('Replace current progress with the previous checkpoint? Cancel to export a backup first.'+replacementWarning()))await recoverPrevious();});
      button('New journey',async()=>{if(confirm('Start a new journey and replace this app’s current save? Cancel to Export JSON first.'+replacementWarning()))await newJourney();});
      button('Retry / reload saved',async()=>{if(confirm('Reload browser checkpoint? Unsaved changes will be lost. Cancel to export first.'))await retry();});
      button('Use memory only',()=>{if(confirm('Continue without automatic saving? Existing browser records stay untouched; export before leaving.'))useMemoryOnly();});
      continueButton=button('Continue without saving',()=>{if(confirm('Change view WITHOUT saving? Cross-page progress may be lost.'))continueWithoutSaving();});
      button('Close',()=>dialog.close());
      saveButton.addEventListener('click',()=>{panelStable=ready&&!busy&&adapter.stable();dialog.showModal();pause(true);dialog.querySelector('button').focus();});
      dialog.addEventListener('close',()=>{pendingRoute=null;pause(busy||hardBlocked);status(statusValue.code,statusValue.message);saveButton.focus();});
      host.append(saveButton);document.body.append(dialog);
      // Live status remains announced even when the modal is closed.
      const live=document.createElement('span');live.className='expanse-save-live';live.setAttribute('role','status');live.setAttribute('aria-live','polite');host.append(live);
      const observer=new MutationObserver(()=>{live.textContent=statusNode.textContent;});observer.observe(statusNode,{childList:true,characterData:true,subtree:true});
      status(statusValue.code,statusValue.message);
    }
    controls();root.__expanseSave=session;
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ready&&!busy&&!blocked&&adapter.stable())checkpoint().catch(()=>{});});
    root.addEventListener('pagehide',()=>{if(ready&&!busy&&!blocked&&adapter.stable())checkpoint().catch(()=>{});});
    await load();return session;
  }
  root.ExpanseSave=Object.freeze({start});
})(globalThis);
