(function (root) {
  'use strict';
  const C = root.ExpanseSaveCore;
  function error(code, message) { return new C.SaveError(code, message); }
  function scope(baseURL) {
    const base = new URL(baseURL);
    if (!['http:','https:'].includes(base.protocol)) throw error('UNAVAILABLE','Automatic saves require HTTP(S); use JSON backups in file mode.');
    if (base.origin !== root.location.origin) throw error('UNAVAILABLE','Save origin does not match this application.');
    const path = new URL('./', base).pathname;
    return 'the-expanse/save/v1:' + path;
  }
  function open(baseURL) {
    return new Promise((resolve,reject) => {
      let request, name;
      try { name=scope(baseURL); request=root.indexedDB.open(name,2); }
      catch (_) { reject(error('UNAVAILABLE','Browser storage is unavailable. Use Export JSON.')); return; }
      let settled=false;
      const timer=setTimeout(()=>{settled=true;reject(error('UNAVAILABLE','Browser storage is blocked by another connection. Close old tabs and Retry.'));},4000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots');};
      request.onerror=()=>{clearTimeout(timer);reject(error('UNAVAILABLE','Could not open browser storage. Use Export JSON.'));};
      request.onsuccess=()=>{
        clearTimeout(timer);const db=request.result;
        if(settled){db.close();return;} settled=true;
        db.onversionchange=()=>db.close();
        function read() {
          return new Promise((done,fail)=>{
            let tx;try{tx=db.transaction('snapshots','readonly');}catch(e){fail(e);return;}
            const store=tx.objectStore('snapshots'),current=store.get('current'),previous=store.get('previous');
            tx.oncomplete=()=>done({current:current.result===undefined?null:current.result,previous:previous.result===undefined?null:previous.result});
            tx.onabort=()=>fail(error('UNAVAILABLE','Could not read existing checkpoint; it has not been erased.'));
            tx.onerror=()=>{};
          });
        }
        function write(snapshot,expectedRevision,recovery) {
          let candidate;try{candidate=C.validate(snapshot);}catch(e){return Promise.reject(e);}
          return new Promise((done,fail)=>{
            let tx,reason,next;
            try{tx=db.transaction('snapshots','readwrite');}catch(e){fail(error('UNAVAILABLE','Storage write unavailable; old checkpoint retained.'));return;}
            const store=tx.objectStore('snapshots'),get=store.get('current');
            get.onsuccess=()=>{
              try {
                const raw=get.result;
                const revision=raw===undefined ? 0 : raw && Number.isSafeInteger(raw.revision) && raw.revision>=0 ? raw.revision : null;
                if(revision!==expectedRevision){reason=error('CONFLICT','Another tab changed this save. Export your progress, then reload before replacing it.');tx.abort();return;}
                let preceding=null;
                if(raw!==undefined){try{C.validate(raw);preceding=raw;}catch(e){if(!recovery){reason=e;tx.abort();return;}}}
                const nextRevision=revision===null?1:revision+1;
                if(!Number.isSafeInteger(nextRevision)){reason=error('INVALID','Save revision limit reached; export a backup.');tx.abort();return;}
                next=C.validate({...candidate,revision:nextRevision,savedAt:new Date().toISOString()});
                if(preceding)store.put(preceding,'previous');
                store.put(next,'current');
              }catch(e){reason=e instanceof C.SaveError?e:error('UNAVAILABLE','Checkpoint failed ('+(e.name||'storage error')+'); old data retained.');tx.abort();}
            };
            tx.oncomplete=()=>done(next);
            tx.onabort=()=>fail(reason||error('UNAVAILABLE','Checkpoint failed ('+((tx.error&&tx.error.name)||'storage error')+'); previous data retained.'));
            tx.onerror=()=>{};
          });
        }
        resolve(Object.freeze({name,read,commit:(v,r)=>write(v,r,false),replace:(v,r)=>write(v,r,true),close:()=>db.close()}));
      };
    });
  }
  root.ExpanseSaveStorage=Object.freeze({open,scope});
})(globalThis);
