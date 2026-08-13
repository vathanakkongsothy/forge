import type { WebContents } from "electron";
import { BrowserWorkspace, type CdpClient } from "@forge/browser";

export class ElectronCdp implements CdpClient {
  attached = false;

  constructor(private wc: WebContents) {}

  async attach(): Promise<void> {
    if (this.attached || this.wc.debugger.isAttached()) {
      this.attached = true;
      return;
    }
    this.wc.debugger.attach("1.3");
    this.attached = true;
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Console.enable");
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    await this.attach();
    return this.wc.debugger.sendCommand(method, params) as Promise<T>;
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{ result?: { value?: T; description?: string } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result?.value as T;
  }
}

export function attachBrowserWorkspace(wc: WebContents, workspace: { current?: BrowserWorkspace }): BrowserWorkspace {
  const cdp = new ElectronCdp(wc);
  const session = new BrowserWorkspace(cdp);
  workspace.current = session;

  wc.on("console-message", (_e, level, message) => {
    const names = ["log", "warning", "error", "debug", "info"];
    session.pushConsole({
      level: names[level] ?? "log",
      text: String(message),
      timestamp: Date.now(),
    });
  });

  wc.debugger.on("message", (_event, method, params) => {
    const p = params as {
      requestId?: string;
      request?: { method?: string; url?: string };
      response?: { status?: number; url?: string };
    };
    if (method === "Network.requestWillBeSent" && p.requestId && p.request) {
      session.pushNetwork({
        id: p.requestId,
        method: p.request.method ?? "GET",
        url: p.request.url ?? "",
        timestamp: Date.now(),
      });
    }
    if (method === "Network.responseReceived" && p.requestId && p.response) {
      session.pushNetwork({
        id: p.requestId,
        method: "GET",
        url: p.response.url ?? "",
        status: p.response.status,
        failed: (p.response.status ?? 0) >= 400,
        timestamp: Date.now(),
      });
    }
    if (method === "Network.loadingFailed" && p.requestId) {
      session.pushNetwork({
        id: p.requestId,
        method: "GET",
        url: "",
        failed: true,
        timestamp: Date.now(),
      });
    }
  });

  void cdp.attach();
  return session;
}
