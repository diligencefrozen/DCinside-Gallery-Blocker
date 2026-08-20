/*****************************************************************
 * cleaner-anonymous.js — 비회원(갤로그 링크 없음) 글/댓글 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-anonymous-clean-style";
  const HIDDEN_CLASS = "dcb-anonymous-hidden";
  const REVEAL_ATTR = "data-dcb-anonymous-reveal";
  const WRITER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".writer_info[data-ip]",
    ".writer_info[data-memo-ip]",
    ".user_info[data-ip]",
    ".user_info[data-memo-ip]",
    ".cmt_nickbox[data-ip]",
    ".cmt_nickbox[data-memo-ip]",
    "[data-loc='list'][data-ip]",
    "[data-loc='list'][data-memo-ip]",
    "[data-loc='view'][data-ip]",
    "[data-loc='view'][data-memo-ip]"
  ].join(",");
  const MEMBER_MARKER_SELECTOR = [
    ".writer_nikcon",
    "[onclick*='gallog']",
    "[href*='gallog']",
    "[title*='갤로그']"
  ].join(",");
  const COMMENT_ROOT_SELECTOR = [
    "#focus_cmt",
    ".comment_wrap",
    ".cmt_list",
    ".reply_box",
    ".reply_list",
    ".dccon_comment_box"
  ].join(",");
  const COMMENT_ITEM_SELECTOR = [
    "#focus_cmt li",
    ".comment_wrap li",
    ".cmt_list li",
    ".reply_box li",
    ".reply_list li",
    ".dccon_comment_box li",
    "li.ub-content"
  ].join(",");
  const LIST_ITEM_SELECTOR = [
    ".gall_list tr.ub-content",
    ".gall_list tr[data-no]",
    ".gall_list tr.gall_tr",
    "tr.ub-content",
    "tr[data-no]",
    "tr.gall_tr",
    ".gall_list li.ub-content",
    ".gall_list li.gall_item",
    "li.gall_item",
    ".gall_item"
  ].join(",");

  let hideEnabled = false;
  let observer = null;
  let scanFrame = 0;

  /* <style> 보장 */
  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    const css = `.${HIDDEN_CLASS}{display:none!important}`;
    if (style.textContent !== css) style.textContent = css;
    return style;
  }

  function readIdentityAttribute(writer, names) {
    for (const name of names) {
      const own = writer.getAttribute?.(name);
      if (own && String(own).trim()) return String(own).trim();

      const child = writer.querySelector?.(`[${name}]`);
      const nested = child?.getAttribute?.(name);
      if (nested && String(nested).trim()) return String(nested).trim();
    }
    return "";
  }

  function containsIp(value) {
    return /(?:^|[^\d])\d{1,3}(?:\.\d{1,3}){1,3}(?:[^\d]|$)/.test(
      String(value || "").trim()
    );
  }

  function hasMemberMarker(writer) {
    if (writer.matches?.(MEMBER_MARKER_SELECTOR)) return true;
    if (writer.querySelector?.(MEMBER_MARKER_SELECTOR)) return true;

    return !!readIdentityAttribute(writer, [
      "data-full-uid",
      "data-uid",
      "data-memo-uid",
      "data-user-id",
      "data-userid",
      "data-user_id"
    ]);
  }

  function hasAnonymousIp(writer) {
    const attrIp = readIdentityAttribute(writer, ["data-ip", "data-memo-ip"]);
    if (containsIp(attrIp)) return true;

    const ipBadge = writer.matches?.(".ip,.writer_ip,.refresherUserData.ip")
      ? writer
      : writer.querySelector?.(".ip,.writer_ip,.refresherUserData.ip");

    return containsIp(ipBadge?.textContent || "");
  }

  /* 작성자가 비회원(갤로그 링크 없음)인지 판단 */
  function isAnonymous(writer) {
    if (!writer) return false;

    // UID 또는 갤로그 표식이 있으면 회원이다.
    if (hasMemberMarker(writer)) return false;

    // 비회원은 span.ip뿐 아니라 data-ip/data-memo-ip로도 표시된다.
    return hasAnonymousIp(writer);
  }

  function findCommentItem(writer) {
    if (!writer.closest?.(COMMENT_ROOT_SELECTOR)) return null;
    return writer.closest?.(COMMENT_ITEM_SELECTOR) || null;
  }

  function findViewContainer(writer) {
    const isViewWriter =
      writer.getAttribute?.("data-loc") === "view" ||
      !!writer.closest?.(".gallview_head,.view_head,.view_content_wrap");

    if (!isViewWriter) return null;

    return (
      writer.closest?.(".view_content_wrap") ||
      document.querySelector?.(".view_content_wrap") ||
      writer.closest?.(".view_wrap,.gallview,article,.gallview_head,.view_head") ||
      null
    );
  }

  function findAnonymousTarget(writer) {
    const commentItem = findCommentItem(writer);
    if (commentItem) return commentItem;

    const listItem = writer.closest?.(LIST_ITEM_SELECTOR);
    if (listItem) return listItem;

    return findViewContainer(writer);
  }

  function isTemporarilyRevealed(target) {
    const token = String(target?.getAttribute?.(REVEAL_ATTR) || "").trim();
    if (!token) return false;
    if (token === "1") return true;
    const itemNo = String(target?.getAttribute?.("data-no") || "").trim();
    return !!itemNo && token === `no:${itemNo}`;
  }

  /* 비회원 글/댓글을 숨기기 위한 selector 수집 */
  function getAnonymousElements() {
    const anonymousElements = new Set();

    document.querySelectorAll(WRITER_SELECTOR).forEach((writer) => {
      if (!isAnonymous(writer)) return;
      const target = findAnonymousTarget(writer);
      if (target && !isTemporarilyRevealed(target)) anonymousElements.add(target);
    });

    return Array.from(anonymousElements);
  }

  function clearHiddenElements() {
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((element) => {
      element.classList.remove(HIDDEN_CLASS);
    });
  }

  /* 현재 DOM에 존재하는 비회원 요소 즉시 숨기기 */
  function hideNow() {
    if (!hideEnabled) return;
    ensureStyle();
    clearHiddenElements();
    const elements = getAnonymousElements();

    elements.forEach((el) => {
      el.classList.add(HIDDEN_CLASS);
    });
  }

  function scheduleHideNow() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      hideNow();
    });
  }

  /* MutationObserver – 동적 로딩(리스트 리프레셔, 댓글 새로고침) 대응 */
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
      const shouldScan = records.some((record) =>
        record.type === "attributes" || record.addedNodes.length || record.removedNodes.length
      );
      if (shouldScan) scheduleHideNow();
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-ip",
        "data-memo-ip",
        "data-full-uid",
        "data-uid",
        "data-memo-uid",
        "data-user-id",
        "data-userid",
        "data-user_id",
        "data-no",
        REVEAL_ATTR,
        "href",
        "onclick",
        "title"
      ]
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scanFrame) {
      cancelAnimationFrame(scanFrame);
      scanFrame = 0;
    }
    clearHiddenElements();
    document.querySelectorAll(`[${REVEAL_ATTR}]`).forEach((element) => {
      element.removeAttribute(REVEAL_ATTR);
    });
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  /* 설정값 읽어 적용 */
  function apply() {
    chrome.storage.sync.get(
      { hideAnonymousEnabled: false },
      ({ hideAnonymousEnabled }) => {
        hideEnabled = !!hideAnonymousEnabled;

        if (!hideEnabled) {
          stopObserver();
          return;
        }

        ensureStyle();
        hideNow();
        startObserver();
      }
    );
  }

  // --- storage: 초기 로드 & 변경 반영 ---
  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      apply();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.hideAnonymousEnabled) return;
        hideEnabled = !!changes.hideAnonymousEnabled.newValue;
        if (!hideEnabled) {
          stopObserver();
        } else {
          ensureStyle();
          hideNow();
          startObserver();
        }
      });
    }
  } catch (e) {
    // storage 없을 시 기본값(false)로 동작
  }
})();
