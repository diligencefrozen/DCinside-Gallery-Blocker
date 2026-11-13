(() => {
  if (globalThis.DCBBlockTarget) return;
  function options({ uid, ip, nick }) {
    const name = String(nick || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const safe = name && !/^(?:ᄋᄋ|ㅇㅇ|익명|무명|유동|유동닉|anonymous)$/i.test(name) && name.length <= 80;
    return [uid, ip, safe && "nick-exact:" + name, safe && [...name].length >= 2 && "nick:" + name].filter(Boolean);
  }
  function label(token) {
    if (token.startsWith("nick-exact:")) return "닉네임 정확 일치 · " + token.slice(11);
    if (token.startsWith("nick:")) return "닉네임 일부 포함 · " + token.slice(5);
    return (/^\d+\.\d+$/.test(token) ? "IP · " : "회원 ID · ") + token;
  }
  function choose(tokens, title, blocked) {
    const old = document.querySelector("dialog[data-dcb-owned='block-target']");
    old?.close();
    const dialog = document.createElement("dialog");
    dialog.dataset.dcbOwned = "block-target";
    dialog.setAttribute("aria-label", title);
    dialog.style.cssText = "max-width:min(27rem,90vw);padding:16px;border:1px solid GrayText;border-radius:12px;color:CanvasText;background:Canvas";
    const heading = document.createElement("strong");
    heading.textContent = title;
    dialog.append(heading);
    return new Promise(resolve => {
      for (const token of [...tokens, ""]) {
        const button = document.createElement("button");
        button.type = "button";
        button.style.cssText = "display:block;width:100%;margin-top:8px;padding:6px";
        button.textContent = token ? label(token) + (blocked?.has(token.toLowerCase()) ? " · 차단됨" : "") : "취소";
        button.onclick = () => dialog.close(token);
        dialog.append(button);
      }
      dialog.addEventListener("close", () => { dialog.remove(); resolve(dialog.returnValue); }, {once:true});
      document.documentElement.append(dialog);
      dialog.showModal();
    });
  }
  globalThis.DCBBlockTarget = { options, label, choose };
})();
