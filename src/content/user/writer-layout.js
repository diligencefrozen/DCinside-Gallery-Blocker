/* One layout owner for DCInside list, post, comment and preview identities. Native loaders,
 * reply containers and user menus remain owned by DCInside. */
(() => {
  "use strict";
  if (globalThis.DCBWriterLayout) return;

  const WRITER_SELECTOR = ".gall_writer,.ub-writer";
  const COMMENT_ROOT_SELECTOR = "#focus_cmt,.comment_wrap,.comment_box,.cmt_list,.reply_list,.reply_box,.cmt_nickbox,.cmt_info,.reply_info,.dccon_comment_box";
  const LIST_ROOT_SELECTOR = ".gall_list,.list_array,.ub-list,.dccon_list,.issuebox";
  const TOOLS_CLASS = "dcb-writer-tools";
  const ENHANCED_CLASS = "dcb-writer-enhanced";
  const TOOL_SELECTORS = { provider: ".dc-member-ip-chip", uid: ".dcb-uid-badge", memo: ".dcb-user-memo-trigger" };
  const FIT_PROPERTIES = ["--dcb-writer-name-size", "--dcb-writer-uid-fitted-size", "--dcb-writer-memo-fitted-size", "--dcb-writer-name-limit", "--dcb-writer-uid-limit", "--dcb-writer-memo-limit"];
  const states = new WeakMap();
  const activeWriters = new Set();
  const pendingFit = new Set();
  const boundaries = new Map();
  let fitFrame = 0;
  let resizeObserver = null;

  function getWriter(value) {
    if (!(value instanceof Element)) return null;
    return value.matches(WRITER_SELECTOR) ? value : value.closest(WRITER_SELECTOR);
  }

  function detectContext(value) {
    const writer = getWriter(value);
    if (!writer) return "unknown";
    if (writer.closest("#dcb-preview-overlay,.dcbpv-panel")) {
      return writer.closest(".dcbpv-comment-item,.dcbpv-comment-html") ? "preview-comment" : "preview-post";
    }
    if (writer.closest(COMMENT_ROOT_SELECTOR)) return "comment";
    if (writer.dataset.loc === "list" || writer.closest(LIST_ROOT_SELECTOR) || writer.closest("tr")) return "list";
    if (/\/(?:mgallery\/|mini\/|person\/)?board\/view(?:\/|$)/.test(location.pathname)) return "post";
    return "unknown";
  }

  function memoMode(value, hasMemo = false) {
    return ["post", "comment", "preview-post", "preview-comment"].includes(detectContext(value))
      ? (hasMemo ? "text" : "icon") : "hidden";
  }

  function nativeElement(writer, selector, root = writer) {
    return [...root.querySelectorAll(selector)].find((node) => {
      const owned = node.closest("[data-dcb-owned]");
      return node.closest(WRITER_SELECTOR) === writer && !node.closest(".user_data_list,.dcbpv-user-data-list") &&
        (!owned || owned === writer || !writer.contains(owned));
    }) || null;
  }

  function getParts(value) {
    const writer = getWriter(value);
    if (!writer) return null;
    const addbox = nativeElement(writer, ".addbox");
    const nickname = nativeElement(writer, ".nickname,.nick_name,.user_nick") || nativeElement(writer, "em");
    const nameText = nickname?.matches("em") ? nickname : (nickname && nativeElement(writer, "em", nickname)) ||
      (nickname && !nickname.querySelector(".ip,.writer_ip,.writer_nikcon,.user_data_list,.user_data") ? nickname : null);
    const icon = nativeElement(writer, ".writer_nikcon");
    const nativeIp = nativeElement(writer, ".ip,.writer_ip");
    const identities = [nickname, icon, nativeIp].filter(Boolean);
    let row = addbox && identities.every((node) => addbox.contains(node)) ? addbox : nickname?.parentElement || writer;
    while (row !== writer && !identities.every((node) => row.contains(node))) row = row.parentElement;
    const tools = [...writer.querySelectorAll(`.${TOOLS_CLASS}`)].find((node) => node.closest(WRITER_SELECTOR) === writer) || null;
    const context = detectContext(writer);
    const nativeShell = context === "post" && (row !== writer || !!writer.querySelector(":scope > .fr"));
    return { writer, addbox, row, nickname, nameText, icon, nativeIp, tools, context, nativeShell };
  }

  function setAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function setProperty(writer, name, value) {
    if (writer.style.getPropertyValue(name) !== value) writer.style.setProperty(name, value);
  }

  function mark(node, name, state) {
    if (!node || node.classList.contains(name)) return;
    node.classList.add(name);
    state.marked.push([node, name]);
  }

  function directChildOf(node, parent) {
    while (node && node.parentElement !== parent) node = node.parentElement;
    return node;
  }

  function removeNativeWhitespace(value) {
    return removePartWhitespace(getParts(value));
  }

  function removePartWhitespace(parts) {
    if (!parts || !["list", "comment"].includes(parts.context) || !parts.icon?.matches("a.writer_nikcon")) return parts;
    const whitespace = parts.icon.previousSibling;
    const previous = whitespace?.previousSibling;
    const nameBoundary = previous === parts.nameText || previous === parts.nickname;
    if (nameBoundary && previous?.matches?.("em,.nickname,.nick_name,.user_nick") &&
        whitespace?.nodeType === Node.TEXT_NODE && /^\s+$/.test(whitespace.nodeValue || "")) whitespace.remove();
    return parts;
  }

  function ensureTools(parts) {
    const { writer, row, nickname, icon, nativeIp } = parts;
    const hosts = [...writer.querySelectorAll(`.${TOOLS_CLASS}`)].filter((node) => node.closest(WRITER_SELECTOR) === writer);
    const tools = hosts.shift() || document.createElement("span");
    if (!tools.classList.contains(TOOLS_CLASS)) tools.classList.add(TOOLS_CLASS);
    setAttribute(tools, "data-dcb-owned", "writer-layout");
    // Merge only DCB hosts, never native containers or menu nodes.
    hosts.forEach((host) => { [...host.children].forEach((child) => tools.appendChild(child)); host.remove(); });
    const anchors = new Set([nickname, icon, nativeIp].map((node) => directChildOf(node, row)).filter(Boolean));
    const anchor = [...row.children].filter((node) => anchors.has(node)).pop();
    if (anchor) {
      if (anchor.nextElementSibling !== tools) anchor.insertAdjacentElement("afterend", tools);
    } else if (tools.parentElement !== row) row.appendChild(tools);
    return tools;
  }

  function order(value) {
    return orderParts(getParts(value));
  }

  function orderParts(parts) {
    if (!parts?.tools) return parts;
    if (parts.context === "list") parts.tools.querySelectorAll(TOOL_SELECTORS.memo).forEach((node) => node.remove());
    const known = Object.fromEntries(Object.entries(TOOL_SELECTORS).map(([kind, selector]) =>
      [kind, parts.tools.querySelector(`:scope > ${selector}`)]
    ));
    Object.entries(TOOL_SELECTORS).forEach(([kind, selector]) => {
      parts.tools.querySelectorAll(`:scope > ${selector}`).forEach((node) => { if (node !== known[kind]) node.remove(); });
    });
    const sequence = parts.nativeIp ? [known.provider, known.uid, known.memo] : [known.uid, known.provider, known.memo];
    const children = [...parts.tools.children];
    const desired = [...sequence.filter(Boolean), ...children.filter((node) => !sequence.includes(node))];
    if (children.some((node, index) => node !== desired[index])) desired.forEach((node) => parts.tools.appendChild(node));
    return parts;
  }

  function getBoundary(parts) {
    // Use the existing author column. In particular, never borrow comment-body width.
    if (parts.context === "comment") return parts.writer.closest(".cmt_nickbox") || parts.writer.parentElement;
    if (parts.context.startsWith("preview-")) return parts.writer.closest(".dcbpv-comment-meta,.dcbpv-writer") || parts.writer.parentElement;
    if (parts.nativeShell) return parts.writer;
    return parts.writer.closest("td,th") || parts.writer.parentElement;
  }

  function unwatch(writer, state) {
    const owners = boundaries.get(state?.boundary);
    owners?.delete(writer);
    if (owners && !owners.size) {
      resizeObserver?.unobserve(state.boundary);
      boundaries.delete(state.boundary);
    }
    activeWriters.delete(writer);
    pendingFit.delete(writer);
  }

  function watch(parts, state) {
    const boundary = getBoundary(parts);
    if (!boundary || (state.boundary === boundary && activeWriters.has(parts.writer))) return;
    unwatch(parts.writer, state);
    state.boundary = boundary;
    if (!boundaries.has(boundary)) {
      boundaries.set(boundary, new Set());
      if (typeof ResizeObserver === "function") {
        resizeObserver ||= new ResizeObserver((entries) => {
          entries.forEach(({ target, contentRect }) => {
            boundaries.get(target)?.forEach((writer) => {
              const current = states.get(writer);
              if (current && Math.abs((current.observedWidth || 0) - contentRect.width) > 1) {
                current.observedWidth = contentRect.width;
                scheduleFit(writer);
              }
            });
          });
        });
        resizeObserver.observe(boundary);
      }
    }
    boundaries.get(boundary).add(parts.writer);
    activeWriters.add(parts.writer);
  }

  function normalize(value) {
    const parts = getParts(value);
    if (!parts) return null;
    if (parts.context === "list") parts.writer.querySelectorAll(TOOL_SELECTORS.memo).forEach((node) => node.remove());
    let state = states.get(parts.writer);
    if (!state) { state = { marked: [], key: "" }; states.set(parts.writer, state); }
    if (state.row !== parts.row || state.nameText !== parts.nameText || state.icon !== parts.icon || state.nativeIp !== parts.nativeIp) {
      state.key = "";
      Object.assign(state, { row: parts.row, nameText: parts.nameText, icon: parts.icon, nativeIp: parts.nativeIp });
    }
    removePartWhitespace(parts);
    mark(parts.writer, ENHANCED_CLASS, state);
    mark(parts.writer, "dcb-writer-layout", state);
    mark(parts.row, "dcb-writer-row", state);
    mark(parts.nickname, "dcb-writer-name", state);
    mark(parts.nameText, "dcb-writer-name-text", state);
    mark(parts.icon, "dcb-writer-native-icon", state);
    mark(parts.nativeIp, "dcb-writer-native-ip", state);
    for (let shell = parts.row.parentElement; shell && parts.writer.contains(shell) && shell !== parts.writer; shell = shell.parentElement) {
      mark(shell, "dcb-writer-shell", state);
    }
    if (parts.context !== "unknown") setAttribute(parts.writer, "data-dcb-writer-context", parts.context);
    else parts.writer.removeAttribute("data-dcb-writer-context");
    if (parts.nativeShell) setAttribute(parts.writer, "data-dcb-writer-native-shell", "true");
    else parts.writer.removeAttribute("data-dcb-writer-native-shell");
    const hasIp = parts.nativeIp ? "true" : "false";
    setAttribute(parts.writer, "data-dcb-writer-has-ip", hasIp);
    parts.tools = ensureTools(parts);
    orderParts(parts);
    if (parts.context !== "unknown") watch(parts, state);
    scheduleFit(parts.writer);
    return parts;
  }

  function attach(value, element, kind) {
    if (!(element instanceof Element)) return null;
    if (kind === "memo" && memoMode(value) === "hidden") {
      element.remove();
      remove(value, "memo");
      return null;
    }
    const parts = normalize(value);
    if (!parts) return null;
    parts.writer.querySelectorAll(TOOL_SELECTORS[kind]).forEach((node) => { if (node !== element) node.remove(); });
    if (!element.hasAttribute("data-dcb-owned")) element.dataset.dcbOwned = `writer-${kind}`;
    if (element.parentElement !== parts.tools) parts.tools.appendChild(element);
    orderParts(parts);
    scheduleFit(parts.writer);
    return element;
  }

  function attachProviderToIp(ipElement, chip) {
    const writer = getWriter(ipElement);
    if (writer) return attach(writer, chip, "provider");
    // Some article-header IPs live outside a .gall_writer. Their placement is
    // still owned here, without rebuilding the native header.
    if (ipElement instanceof Element && chip instanceof Element && ipElement.nextElementSibling !== chip) {
      ipElement.insertAdjacentElement("afterend", chip);
    }
    return chip;
  }

  function attachActionAfterIdentity(value, action, scope = null) {
    if (!(action instanceof Element)) return null;
    const writer = getWriter(value) || (value instanceof Element ? value.querySelector(WRITER_SELECTOR) : null);
    const parts = getParts(writer);
    const identityScope = scope || parts?.row;
    if (!(identityScope instanceof Element) ||
        (writer && !identityScope.contains(writer) && !writer.contains(identityScope))) return null;
    if (!writer && !identityScope.matches(".cmt_nickbox")) return null;

    // A native comment icon/IP can be a sibling of .gall_writer, including
    // inside an addbox. Place actions after that whole branch without moving
    // native nodes or creating a writer-tools slot for inactive features.
    const nickname = parts?.nickname || identityScope.querySelector(".nickname,.nick_name,.user_nick");
    const anchors = new Set([writer, nickname, parts?.icon, parts?.nativeIp, parts?.tools]
      .filter(Boolean).map((node) => directChildOf(node, identityScope)).filter(Boolean));
    identityScope.querySelectorAll(".writer_nikcon,.gallercon,.ip,.writer_ip").forEach((node) => {
      if (node.closest("[data-dcb-owned],.user_data,.user_data_list,.dcbpv-user-data-list")) return;
      const nativeWriter = node.closest(WRITER_SELECTOR);
      if (nativeWriter && nativeWriter !== writer) return;
      if (scope?.matches(".cmt_nickbox") && node.closest(".cmt_nickbox") !== scope) return;
      anchors.add(directChildOf(node, identityScope));
    });
    const anchor = [...identityScope.children].filter((node) => anchors.has(node)).pop();
    if (!anchor || anchor === action || action.contains(anchor)) return null;
    if (action.parentElement !== identityScope || anchor.nextElementSibling !== action) {
      anchor.insertAdjacentElement("afterend", action);
    }
    scheduleFit(writer);
    return action;
  }

  function cleanup(value) {
    const writer = getWriter(value);
    if (!writer) return;
    const keepPreviewLayout = detectContext(writer).startsWith("preview-");
    writer.querySelectorAll(`.${TOOLS_CLASS}`).forEach((host) => { if (!host.children.length && !keepPreviewLayout) host.remove(); });
    if (writer.querySelector(`.${TOOLS_CLASS}`)) { scheduleFit(writer); return; }
    const state = states.get(writer);
    state?.marked.forEach(([node, name]) => node.classList.remove(name));
    // Also clear class markers left by a previous DCB feature version.
    writer.classList.remove(ENHANCED_CLASS, "dcb-writer-layout");
    ["data-dcb-writer-context", "data-dcb-writer-has-ip", "data-dcb-writer-native-shell", "data-dcb-writer-density", "data-dcb-writer-name-fit"].forEach((name) => writer.removeAttribute(name));
    [...FIT_PROPERTIES, "--dcb-writer-available"].forEach((name) => writer.style.removeProperty(name));
    state?.nameText?.classList.remove("dcb-writer-name-clipped");
    if (state?.titleAdded && state.titleAdded.node.title === state.titleAdded.value) state.titleAdded.node.removeAttribute("title");
    unwatch(writer, state);
    states.delete(writer);
  }

  function remove(value, kind) {
    const writer = getWriter(value);
    if (!writer || !TOOL_SELECTORS[kind]) return;
    writer.querySelectorAll(TOOL_SELECTORS[kind]).forEach((node) => node.remove());
    cleanup(writer);
  }

  function scheduleFit(value) {
    const writer = getWriter(value);
    if (!writer || !activeWriters.has(writer)) return;
    pendingFit.add(writer);
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      const writers = [...pendingFit];
      pendingFit.clear();
      writers.forEach(fitWriter);
    });
  }

  const px = (value) => Number.parseFloat(value) || 0;
  function outerWidth(node) {
    if (!node) return 0;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") return 0;
    return node.getBoundingClientRect().width + px(style.marginLeft) + px(style.marginRight);
  }

  function insets(node) {
    const style = getComputedStyle(node);
    return px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth) + px(style.marginLeft) + px(style.marginRight);
  }

  function nativeWidth(node, parts) {
    if (node === parts.nameText || node === parts.tools || node.matches(".user_data_list")) return 0;
    if (node === parts.row || node.contains(parts.nameText) || node.contains(parts.tools)) {
      const shell = node === parts.row ? 0 : insets(node);
      return shell + [...node.children].reduce((sum, child) => sum + nativeWidth(child, parts), 0);
    }
    return node.matches(".user_data") ? 0 : outerWidth(node);
  }

  function fitWriter(writer) {
    const state = states.get(writer);
    if (!state || !writer.isConnected) { unwatch(writer, state); return; }
    const parts = getParts(writer);
    if (!parts?.tools || parts.context === "unknown") return;
    if (state.row !== parts.row || state.nameText !== parts.nameText || state.icon !== parts.icon || state.nativeIp !== parts.nativeIp) {
      normalize(writer);
      return;
    }
    const boundaryStyle = getComputedStyle(state.boundary);
    const branch = state.boundary === parts.row ? null : directChildOf(parts.row, state.boundary);
    const siblings = branch ? [...state.boundary.children] : [];
    const visibleSiblings = siblings.filter((child) => {
      const childStyle = getComputedStyle(child);
      return childStyle.display !== "none" && !["absolute", "fixed"].includes(childStyle.position);
    });
    const boundaryGap = /flex|grid/.test(boundaryStyle.display) ? Math.max(0, visibleSiblings.length - 1) * px(boundaryStyle.columnGap) : 0;
    const reserved = visibleSiblings.reduce((sum, child) => sum + (child === branch ? 0 : outerWidth(child)), boundaryGap);
    const available = state.boundary.clientWidth - px(boundaryStyle.paddingLeft) - px(boundaryStyle.paddingRight) - reserved;
    if (available <= 0) return; // Native hidden/loading state: wait for a real author column.
    const name = parts.nameText;
    const uid = parts.tools.querySelector(TOOL_SELECTORS.uid);
    const memo = parts.tools.querySelector(TOOL_SELECTORS.memo);
    const provider = parts.tools.querySelector(TOOL_SELECTORS.provider);
    const style = getComputedStyle(writer);
    const key = JSON.stringify([Math.round(available), parts.context, name?.textContent, name?.getAttribute("style"), name && getComputedStyle(name).fontFamily,
      uid?.dataset.fullUid, memo?.dataset.fullMemo, memo?.textContent, provider?.textContent,
      style.getPropertyValue("--dcb-writer-normal-gap"), style.getPropertyValue("--dcb-writer-uid-size"), style.getPropertyValue("--dcb-writer-memo-size"),
      document.documentElement.classList.contains("dcb-compact-list-mode"), parts.nativeIp?.textContent, outerWidth(parts.icon), parts.row.children.length, parts.tools.children.length]);
    if (state.key === key) return;
    state.key = key;
    state.nameText = name;
    FIT_PROPERTIES.forEach((property) => writer.style.removeProperty(property));
    writer.removeAttribute("data-dcb-writer-density");
    writer.removeAttribute("data-dcb-writer-name-fit");
    name?.classList.remove("dcb-writer-name-clipped");
    setProperty(writer, "--dcb-writer-available", `${Math.floor(available)}px`);

    const children = [...parts.tools.children];
    const fixedWidth = nativeWidth(parts.row, parts);
    const toolWidths = new Map();
    let nameWidth = 0;
    let spacing = 0;
    const measure = () => {
      const toolsStyle = getComputedStyle(parts.tools);
      nameWidth = outerWidth(name);
      children.forEach((node) => toolWidths.set(node, outerWidth(node)));
      spacing = toolsStyle.display === "none" ? 0 : Math.max(0, children.length - 1) * px(toolsStyle.columnGap) + insets(parts.tools);
    };
    const width = () => fixedWidth + nameWidth + [...toolWidths.values()].reduce((sum, value) => sum + value, 0) + spacing;
    const excess = () => Math.max(0, width() - available);
    measure();
    if (excess() <= 1) return;

    // Compress spacing first, then measured long text. Never shrink native IP,
    // provider labels or native icons. Only individual text receives a limit.
    setAttribute(writer, "data-dcb-writer-density", "compact");
    measure();
    const baseNameSize = name ? px(getComputedStyle(name).fontSize) : 0;
    const fitStep = px(style.getPropertyValue("--dcb-writer-name-step"));
    const minimumName = Math.min(baseNameSize, Math.max(px(style.getPropertyValue("--dcb-writer-name-min")), baseNameSize - fitStep * 3));
    let nameLevel = 0;
    const reduceName = () => {
      while (name && nameLevel < 3 && excess() > 1) {
        nameLevel++;
        setAttribute(writer, "data-dcb-writer-name-fit", String(nameLevel));
        setProperty(writer, "--dcb-writer-name-size", `${Math.max(minimumName, baseNameSize - fitStep * nameLevel)}px`);
        nameWidth = outerWidth(name);
      }
    };
    if (name && nameWidth > available * px(style.getPropertyValue("--dcb-writer-name-soft-ratio"))) reduceName();
    const reduceTool = (node, property, minimum) => {
      if (!node) return;
      const base = px(getComputedStyle(node).fontSize);
      if (base <= 0 || toolWidths.get(node) < base * 6) return;
      const floor = Math.min(base, Math.max(minimum, base - 1));
      for (let step = 1; step <= 2 && excess() > 1; step++) {
        setProperty(writer, property, `${Math.max(floor, base - step * .5)}px`);
        toolWidths.set(node, outerWidth(node));
      }
    };
    reduceTool(uid, "--dcb-writer-uid-fitted-size", 8.5);
    reduceTool(memo, "--dcb-writer-memo-fitted-size", 9);
    const limit = (node, property, minimum) => {
      if (!node || excess() <= 1) return;
      const natural = node === name ? nameWidth : toolWidths.get(node);
      setProperty(writer, property, `${Math.ceil(Math.max(minimum, natural - excess()))}px`);
      if (node === name) nameWidth = outerWidth(node);
      else toolWidths.set(node, outerWidth(node));
    };
    limit(uid, "--dcb-writer-uid-limit", uid ? insets(uid) + px(getComputedStyle(uid).fontSize) * 3 : 0);
    // Keep the memo trigger clickable even when all its text must yield.
    limit(memo, "--dcb-writer-memo-limit", px(style.getPropertyValue("--dcb-writer-memo-min")));
    if (name && excess() > 1) {
      reduceName();
      if (excess() > 1) {
        // Even an extreme width budget must leave a visible nickname label.
        const visibleNameMinimum = Math.min(nameWidth, px(getComputedStyle(name).fontSize) * px(style.getPropertyValue("--dcb-writer-name-min-chars")));
        limit(name, "--dcb-writer-name-limit", visibleNameMinimum);
        name.classList.add("dcb-writer-name-clipped");
        const fullName = name.textContent?.trim();
        if (fullName && (!name.title || (state.titleAdded?.node === name && name.title === state.titleAdded.value))) {
          name.title = fullName;
          state.titleAdded = { node: name, value: fullName };
        }
      }
    }
  }

  function visitWriters(node, callback, descendants = true) {
    if (!(node instanceof Element)) return;
    const writer = getWriter(node);
    if (writer?.classList.contains(ENHANCED_CLASS)) callback(writer);
    if (descendants) node.querySelectorAll(`.${ENHANCED_CLASS}`).forEach(callback);
  }

  globalThis.DCBWriterLayout = Object.freeze({
    WRITER_SELECTOR, TOOLS_CLASS, ENHANCED_CLASS, getWriter, getParts, detectContext, memoMode,
    isListWriter: (writer) => detectContext(writer) === "list",
    ensure: normalize, normalize, order, removeNativeWhitespace, cleanup, remove,
    attachUid: (writer, node) => attach(writer, node, "uid"),
    attachProvider: (writer, node) => attach(writer, node, "provider"), attachProviderToIp,
    attachMemo: (writer, node) => attach(writer, node, "memo"), attachActionAfterIdentity,
    fitNickname: scheduleFit
  });
  // Reuse the shared native-DOM pipeline. No comment request, root mutation,
  // refresh click or polling is performed here.
  let compactMode = document.documentElement?.classList.contains("dcb-compact-list-mode") || false;
  globalThis.DCBDomMutationBus?.subscribe("writer-layout", (records) => {
    if (!activeWriters.size) {
      compactMode = document.documentElement?.classList.contains("dcb-compact-list-mode") || false;
      return;
    }
    records.forEach((record) => {
      if (record.target === document.documentElement && record.attributeName === "class") {
        const next = document.documentElement.classList.contains("dcb-compact-list-mode");
        if (next !== compactMode) {
          compactMode = next;
          activeWriters.forEach((writer) => { if (detectContext(writer) === "list") scheduleFit(writer); });
        }
      }
      boundaries.get(record.target)?.forEach(scheduleFit);
      visitWriters(record.target?.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target, scheduleFit, false);
      record.addedNodes?.forEach((node) => visitWriters(node, scheduleFit));
      record.removedNodes?.forEach((node) => visitWriters(node, (writer) => { if (!writer.isConnected) unwatch(writer, states.get(writer)); }));
    });
  }, { types: ["childList", "characterData", "attributes"], attributes: ["class", "style"], ignoreOwned: false });
  document.fonts?.addEventListener("loadingdone", () => {
    activeWriters.forEach((writer) => { states.get(writer).key = ""; scheduleFit(writer); });
  });
})();
