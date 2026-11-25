// Runs in the native poll document so its parser, scripts and relative URLs
// keep the poll's browsing context when loading the article-referrer response.
(() => {
  if (location.origin !== "https://gall.dcinside.com" || location.pathname !== "/board/poll/vote" ||
      !/^\d+$/.test(new URL(location.href).searchParams.get("no")) || window === top) return;

  let started = false;

  function bindControls() {
    const vote = document.querySelector(".vote");
    if (!vote) return;
    const syncChecks = () => {
      for (const box of vote.querySelectorAll(".vote_categorybox .item_chk")) {
        box.checked = box.closest(".vote_categorybox").classList.contains("sel");
      }
    };
    vote.addEventListener("click", event => {
      const label = event.target.closest(".vote_catelist label[for]");
      if (label?.control?.matches(".item_chk") && label.hasAttribute("onclick")) {
        // chk_vote already ran on the label. Suppress its second checkbox toggle.
        event.preventDefault();
        syncChecks();
        return;
      }
      const input = event.target.closest(".vote_catelist .item_chk");
      const index = input?.id.match(/^item_(\d+)$/)?.[1];
      if (index !== undefined && !input.disabled && typeof window.chk_vote === "function") {
        input.checked = input.closest(".vote_categorybox").classList.contains("sel");
        window.chk_vote(Number(index));
        syncChecks();
      }
    });
    const button = vote.querySelector(".btn_vote");
    if (!button || !window.jQuery) return;
    let pending;
    const events = window.jQuery(document);
    events.on("ajaxSend.dcbPoll", (_event, xhr, settings) => {
      const url = new URL(settings.url, location.href);
      if (url.origin !== location.origin || url.pathname !== "/ajax/poll_ajax/update_vote") return;
      pending = xhr;
      vote.querySelector("[data-dcb-poll-error]")?.remove();
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });
    events.on("ajaxComplete.dcbPoll", (_event, xhr) => {
      if (xhr !== pending || (xhr.status === 200 && /^ok(?:\||$)/.test((xhr.responseText || "").trim()))) return;
      pending = null;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (xhr.status === 0 || xhr.status >= 400) {
        let status = vote.querySelector("[data-dcb-poll-error]");
        if (!status) {
          status = document.createElement("p");
          status.dataset.dcbPollError = "";
          status.setAttribute("role", "status");
          button.after(status);
        }
        status.textContent = "투표 결과를 확인하지 못했습니다. 결과 미리보기에서 확인해 주세요.";
      }
    });
  }

  function open() {
    const frame = window.frameElement;
    if (started || !frame?.closest("#dcb-preview-overlay") ||
        !frame.dataset.dcbpvPollArticle || frame.src !== location.href) return;
    const article = new URL(frame.dataset.dcbpvPollArticle, location.href);
    if (article.origin !== location.origin || !/^\/(?:mgallery\/|mini\/|person\/)?board\/view\/?$/.test(article.pathname) ||
        !article.searchParams.get("id") || !/^\d+$/.test(article.searchParams.get("no"))) return;
    started = true;
    if (!frame.dataset.dcbpvPollNavigated && document.referrer !== article.href) {
      // Only the child history entry changes. A native same-origin navigation
      // supplies the article Referer and a fresh JS realm for DC's poll scripts.
      const poll = location.href;
      frame.dataset.dcbpvPollNavigated = "1";
      history.replaceState(null, "", article.href);
      location.replace(poll);
      return;
    }
    const ready = () => {
      bindControls();
      frame.dataset.dcbpvPollReady = "1";
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, {once:true});
    else ready();
  }
  document.addEventListener("dcb-preview-poll-open", open);
  window.addEventListener("pageshow", open, {once:true});
  open();
})();
