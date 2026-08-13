import type { ConsoleEntry, InspectedElement, NetworkEntry } from "@forge/shared";
import { INSPECT_SCRIPT } from "./inspect-script";

export type CdpClient = {
  attached: boolean;
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  evaluate<T = unknown>(expression: string): Promise<T>;
};

export class BrowserWorkspace {
  console: ConsoleEntry[] = [];
  network: NetworkEntry[] = [];
  lastInspect?: InspectedElement;
  currentUrl = "about:blank";
  onNavigate?: (url: string) => void;

  constructor(private cdp: CdpClient) {}

  pushConsole(entry: ConsoleEntry): void {
    this.console.push(entry);
    this.console = this.console.slice(-300);
    this.tryParseInspect(entry.text);
  }

  pushNetwork(entry: NetworkEntry): void {
    const existing = this.network.find((n) => n.id === entry.id);
    if (existing) Object.assign(existing, entry);
    else this.network.push(entry);
    this.network = this.network.slice(-300);
  }

  private tryParseInspect(text: string): void {
    const marker = "[forge-inspect]";
    const idx = text.indexOf(marker);
    if (idx < 0) return;
    try {
      this.lastInspect = JSON.parse(text.slice(idx + marker.length).trim()) as InspectedElement;
    } catch {
      /* ignore */
    }
  }

  async navigate(url: string): Promise<string> {
    this.currentUrl = url;
    await this.cdp.send("Page.enable");
    await this.cdp.send("Page.navigate", { url });
    this.onNavigate?.(url);
    return url;
  }

  async reload(): Promise<void> {
    await this.cdp.send("Page.reload", { ignoreCache: true });
  }

  async screenshot(): Promise<string> {
    await this.cdp.send("Page.enable");
    const result = await this.cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    return result.data;
  }

  async click(selector: string): Promise<string> {
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false };
        const r = el.getBoundingClientRect();
        el.click();
        return { ok: true, x: r.x + r.width/2, y: r.y + r.height/2 };
      })()
    `;
    const clicked = await this.cdp.evaluate<{ ok: boolean; x?: number; y?: number }>(expr);
    if (!clicked?.ok) throw new Error(`No element for ${selector}`);
    return `clicked ${selector}`;
  }

  async type(selector: string, text: string): Promise<string> {
    const expr = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        if ('value' in el) {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      })()
    `;
    const ok = await this.cdp.evaluate<boolean>(expr);
    if (!ok) throw new Error(`No element for ${selector}`);
    return `typed into ${selector}`;
  }

  async press(key: string): Promise<string> {
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key });
    return `pressed ${key}`;
  }

  async scroll(dx: number, dy: number): Promise<string> {
    await this.cdp.evaluate(`window.scrollBy(${Number(dx)}, ${Number(dy)})`);
    return `scrolled ${dx},${dy}`;
  }

  async getDom(limit = 12_000): Promise<string> {
    const html = await this.cdp.evaluate<string>("document.documentElement.outerHTML");
    return (html ?? "").slice(0, limit);
  }

  async getText(): Promise<string> {
    const text = await this.cdp.evaluate<string>("document.body ? document.body.innerText : ''");
    return (text ?? "").slice(0, 12_000);
  }

  async evaluate(expression: string): Promise<unknown> {
    return this.cdp.evaluate(expression);
  }

  async wait(ms: number): Promise<string> {
    await new Promise((r) => setTimeout(r, Math.min(ms, 30_000)));
    return `waited ${ms}ms`;
  }

  async getUrl(): Promise<string> {
    const url = await this.cdp.evaluate<string>("location.href");
    this.currentUrl = url || this.currentUrl;
    return this.currentUrl;
  }

  async setInspect(enabled: boolean): Promise<void> {
    await this.cdp.evaluate(INSPECT_SCRIPT);
    await this.cdp.evaluate(`window.__forgeInspectEnabled = ${enabled ? "true" : "false"}`);
  }

  async inspectSelector(selector: string): Promise<InspectedElement> {
    await this.cdp.evaluate(INSPECT_SCRIPT);
    const el = await this.cdp.evaluate<InspectedElement | null>(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          classes: [...el.classList],
          text: (el.innerText || "").trim().slice(0, 400),
          selector: ${JSON.stringify(selector)},
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
          styles: { display: cs.display, color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, visibility: cs.visibility },
          accessibility: { role: el.getAttribute("role"), name: el.getAttribute("aria-label"), label: el.getAttribute("aria-label") }
        };
      })()
    `);
    if (!el) throw new Error(`No element for ${selector}`);
    this.lastInspect = el;
    return el;
  }

  async computedStyle(selector: string): Promise<Record<string, string>> {
    const styles = await this.cdp.evaluate<Record<string, string> | null>(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        for (const key of ["display","color","backgroundColor","fontSize","fontWeight","width","height","margin","padding","border","visibility","opacity","position"]) {
          out[key] = cs[key];
        }
        return out;
      })()
    `);
    if (!styles) throw new Error(`No element for ${selector}`);
    return styles;
  }

  consoleDump(failedOnly = false): ConsoleEntry[] {
    return failedOnly ? this.console.filter((c) => c.level === "error") : this.console.slice(-50);
  }

  networkDump(failedOnly = false): NetworkEntry[] {
    return failedOnly ? this.network.filter((n) => n.failed || (n.status && n.status >= 400)) : this.network.slice(-50);
  }
}

export { INSPECT_SCRIPT };
export { connectPlaywrightCdp } from "./playwright";
