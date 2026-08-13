export const INSPECT_SCRIPT = `
(() => {
  if (window.__forgeInspectInstalled) return;
  window.__forgeInspectInstalled = true;
  window.__forgeInspectEnabled = false;
  const box = document.createElement("div");
  box.id = "__forge-inspect-box";
  box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #e0b044;background:rgba(224,176,68,.14);display:none;";
  document.documentElement.appendChild(box);

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { parts.unshift(sel + "#" + el.id); break; }
      if (el.classList.length) sel += "." + [...el.classList].slice(0, 3).join(".");
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.nodeName === el.nodeName);
        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      parts.unshift(sel);
      el = parent;
    }
    return parts.join(" > ");
  }

  function info(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: [...el.classList],
      text: (el.innerText || "").trim().slice(0, 400),
      selector: cssPath(el),
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      styles: {
        display: cs.display,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        visibility: cs.visibility,
        position: cs.position,
        opacity: cs.opacity
      },
      accessibility: {
        role: el.getAttribute("role"),
        name: el.getAttribute("aria-label") || el.getAttribute("name"),
        label: el.getAttribute("aria-label")
      }
    };
  }

  window.addEventListener("mousemove", (e) => {
    if (!window.__forgeInspectEnabled) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.x + "px";
    box.style.top = r.y + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }, true);

  window.addEventListener("click", (e) => {
    if (!window.__forgeInspectEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (!(el instanceof Element)) return;
    window.__forgeSelected = info(el);
    console.info("[forge-inspect]", JSON.stringify(window.__forgeSelected));
  }, true);
})();
`;
