// Explicit import only. Read the three record keys verified in DC's public PC
// scripts. Never enumerate storage, read credentials or change site records.
(() => {
  "use strict";
  async function read(expectedContext = {}) {
    if (location.origin !== "https://gall.dcinside.com" || window.top !== window)
      throw Error("디시 PC 기록의 출처를 확인할 수 없습니다.");
    const incognito=typeof chrome!=="undefined"&&typeof chrome.extension?.inIncognitoContext==="boolean" ? chrome.extension.inIncognitoContext : null;
    if(typeof expectedContext.incognito==="boolean"&&incognito!==null&&incognito!==expectedContext.incognito)
      throw Error("선택한 일반/시크릿 모드와 사이트 읽기 모드가 다릅니다.");
    const keys = ["block_all", "block_parts", "user_memo"];
    const snapshot = () => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
    const before = snapshot();
    if (new TextEncoder().encode(JSON.stringify(before)).length > 4194304)
      throw Error("디시 기록이 한 번에 읽을 수 있는 4MB를 넘습니다.");
    await new Promise(resolve => setTimeout(resolve, 60));
    if (JSON.stringify(before) !== JSON.stringify(snapshot()))
      throw Error("디시 기록이 수집 중 변경되었습니다. 다시 불러오세요.");
    return { source: "dc-native", schema: "dc-pc-local-20261116", href: location.href, context:{incognito}, raw: before };
  }
  globalThis.DCBNativeAuto = Object.freeze({ read });
})();
