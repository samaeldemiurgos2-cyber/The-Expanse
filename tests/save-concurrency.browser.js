async (page)=>{
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    let gate=false,calls=0,release;const hold=new Promise(resolve=>{release=resolve;});
    const adapter={stable:()=>true,capture:()=>({preferences:{quality:'high'}}),pause:()=>{},apply:async()=>{},validate:async()=>{if(gate){calls++;await hold;}}};
    const session=await ExpanseSave.start({view:'chart',baseURL:new URL('/tests/concurrency-'+Date.now()+'/',location.href),adapter});
    gate=true;const first=session.checkpoint().catch(e=>e.code),second=session.checkpoint().catch(e=>e.code);
    await Promise.resolve();const overlap=calls;release();const result=await Promise.all([first,second]);
    if(overlap!==1)throw Error('Only one operation may enter asynchronous adapter validation; saw '+overlap);
    if(result[1]!=='BUSY')throw Error('Concurrent operation must fail safely before its adapter runs');
    return {passed:2,checks:[{name:'save operation owns lock before asynchronous validation',pass:true},{name:'concurrent operation cannot overtake active checkpoint',pass:true}]};
  });
}
