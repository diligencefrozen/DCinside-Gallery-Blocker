const path=require('node:path');
// Match production dependencies; older fixtures loaded feature scripts alone.
module.exports=async function installContentRuntime(page){
  await page.evaluate(()=>{
    chrome.runtime ||= {};chrome.runtime.onMessage ||= {addListener(){}};
    chrome.storage.local ||= {get:async defaults=>defaults||{},set:async()=>{}};
    for(const area of ['sync','local']){
      const storage=chrome.storage[area],get=storage.get.bind(storage);
      storage.get=(keys,callback)=>{
        const promise=new Promise((resolve,reject)=>{
          try{const result=get(keys,resolve);if(result?.then)result.then(resolve,reject);}catch(error){reject(error);}
        });
        if(callback)promise.then(callback);return promise;
      };
    }
  });
  for(const file of ['runtime-settings-cache.js','dom-mutation-bus.js'])await page.addScriptTag({path:path.join(__dirname,'../../src/shared',file)});
  await page.evaluate(()=>DCBRuntimeSettingsCache.ready);
};
