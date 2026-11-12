(() => {
  const toggle = document.getElementById("dcbMaskEnabled");
  const scope = document.getElementById("dcbMaskWriterNames");
  const activity = document.getElementById("dcbShowWriterActivity");
  const cache = globalThis.DCBUiSettingsCache;
  function render() {
    const values = cache.read();
    toggle.checked = ["all","members"].includes(values.dcbMaskWriterNames);
    scope.value = (toggle.checked ? values.dcbMaskWriterNames : values.dcbMaskLastScope) === "members" ? "members" : "all";
    scope.disabled = !toggle.checked;
    activity.checked = values.dcbShowWriterActivity === true;
  }
  function saveMask() {
    scope.disabled = !toggle.checked;
    chrome.storage.sync.set({dcbMaskLastScope:scope.value, dcbMaskWriterNames:toggle.checked ? scope.value : "off"}).catch(render);
  }
  toggle.onchange = scope.onchange = saveMask;
  activity.onchange = () => chrome.storage.sync.set({dcbShowWriterActivity:activity.checked}).catch(render);
  render();
  cache.ready.then(render);
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area === "sync" && (changes.dcbMaskWriterNames || changes.dcbShowWriterActivity || changes.dcbMaskLastScope)) render();
  });
  const openImport = () => {
    if (location.hash === "#dcRecordsImport") {
      const section = document.getElementById("dcRecordsImport");
      if (section) { section.open = true; section.scrollIntoView(); }
    }
  };
  openImport();
  window.addEventListener("hashchange", openImport);
})();
