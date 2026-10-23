async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    const repo=await ExpanseSaveStorage.open(new URL('/tests/profile-restart/',location.href));
    const current=(await repo.read()).current;repo.close();
    if(!current||current.preferences.quality!=='low'||current.preferences.sensitivity!==1.75)throw Error('Real browser restart lost checkpoint');
    return {passed:1,revision:current.revision,savedAt:current.savedAt,preferences:current.preferences};
  });
}
