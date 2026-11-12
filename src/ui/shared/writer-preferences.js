(() => {
  const scope = document.getElementById("dcbMaskWriterNames");
  const activity = document.getElementById("dcbShowWriterActivity");
  const cache = globalThis.DCBUiSettingsCache;
  function render() {
    const values = cache.read();
    scope.value = ["all", "members"].includes(values.dcbMaskWriterNames) ? values.dcbMaskWriterNames : "off";
    activity.checked = values.dcbShowWriterActivity === true;
  }
  scope.onchange = () => chrome.storage.sync.set({dcbMaskWriterNames: scope.value}).catch(render);
  activity.onchange = () => chrome.storage.sync.set({dcbShowWriterActivity:activity.checked}).catch(render);
  render();
  cache.ready.then(render);
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area === "sync" && (changes.dcbMaskWriterNames || changes.dcbShowWriterActivity)) render();
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
