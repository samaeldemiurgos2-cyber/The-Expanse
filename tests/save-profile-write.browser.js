async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    const repo=await ExpanseSaveStorage.open(new URL('/tests/profile-restart/',location.href));
    const old=(await repo.read()).current;
    const saved=await repo.commit(ExpanseSaveCore.fresh({quality:'low',sensitivity:1.75}),old?old.revision:0);
    repo.close();return {written:true,revision:saved.revision,savedAt:saved.savedAt,preferences:saved.preferences};
  });
}
