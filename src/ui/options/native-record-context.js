// Browser-reported window/tab metadata selects the site's storage context.
// Never fall back between normal and private data when the requested one fails.
(() => {
  "use strict";
  const validWindow = value => Number.isInteger(value?.id) && value.id>=0 && typeof value.incognito === "boolean";
  const label = incognito => incognito ? "시크릿/사생활 보호 창" : "일반 창";
  async function allowed(api) {
    if (typeof api.extension?.isAllowedIncognitoAccess !== "function") return false;
    return new Promise((resolve,reject) => {
      try {
        const result=api.extension.isAllowedIncognitoAccess(value => {
          if(api.runtime?.lastError) reject(Error(api.runtime.lastError.message)); else resolve(value===true);
        });
        if(result?.then)result.then(value=>resolve(value===true),reject);
      } catch(error) {reject(error);}
    });
  }
  async function current(api = chrome) {
    if (typeof api.windows?.getCurrent !== "function") throw Error("브라우저 창 모드를 확인할 수 없습니다.");
    const window = await api.windows.getCurrent({populate:false});
    if (!validWindow(window)) throw Error("브라우저 창 모드를 확인할 수 없습니다.");
    return window;
  }
  async function resolve(mode,api = chrome) {
    if (!["current","regular","private"].includes(mode)) throw Error("기록을 불러올 일반/시크릿 창 모드를 선택하세요.");
    const own = await current(api);
    const incognito = mode === "current" ? own.incognito : mode === "private";
    if (incognito && !await allowed(api))
      throw Error("시크릿 창 접근이 허용되지 않았습니다. 브라우저 확장 관리에서 이 확장의 시크릿/사생활 보호 창 실행을 허용한 뒤 다시 불러오세요.");
    if (typeof api.windows.getAll !== "function") throw Error("기록을 읽을 브라우저 창을 확인할 수 없습니다.");
    const windows = await api.windows.getAll({populate:false,windowTypes:["normal"]});
    if (!Array.isArray(windows)) throw Error("브라우저 창 목록을 확인할 수 없습니다.");
    const matches = windows.filter(window=>validWindow(window)&&window.incognito===incognito&&window.type==="normal");
    const selected = matches.find(window=>window.id===own.id) || matches.find(window=>window.focused) || matches[0];
    if (selected) return {windowId:selected.id,incognito,label:label(incognito),ownedWindowId:null};
    if (incognito)
      throw Error("열려 있는 시크릿 창이 없습니다. 종료된 시크릿 세션의 사이트 기록은 복원할 수 없습니다. 시크릿 창이 열린 상태에서 다시 불러오세요.");
    // Persistent normal data can still exist when only private windows remain.
    // Open our own normal helper window, then close it with the import task.
    let created;
    try {
      created = await api.windows.create({url:"about:blank",type:"normal",incognito:false,focused:false});
      if (!validWindow(created) || created.incognito || created.type!=="normal")
        throw Error("일반 창의 기록을 읽을 준비를 하지 못했습니다.");
      return {windowId:created.id,incognito:false,label:label(false),ownedWindowId:created.id};
    } catch(error) {
      if (Number.isInteger(created?.id)) try {await api.windows.remove(created.id);} catch {}
      throw error;
    }
  }
  function verify(tab,context) {
    if (!Number.isInteger(tab?.id) || tab.windowId!==context.windowId || typeof tab.incognito!=="boolean" || tab.incognito!==context.incognito)
      throw Error("선택한 창 모드와 기록 페이지의 모드가 다릅니다. 다른 모드의 기록은 읽지 않았습니다.");
  }
  globalThis.DCBNativeRecordContext = Object.freeze({current,resolve,verify,label});
})();
