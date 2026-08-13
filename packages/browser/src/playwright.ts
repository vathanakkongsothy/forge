import type { Page } from "playwright-core";

export async function connectPlaywrightCdp(port = 9222): Promise<Page | null> {
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    return context?.pages()[0] ?? null;
  } catch {
    return null;
  }
}
