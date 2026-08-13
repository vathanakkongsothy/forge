import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { registerRuntime } from "./runtime";

if (is.dev) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

function preloadPath(): string {
  const mjs = join(__dirname, "../preload/index.mjs");
  const js = join(__dirname, "../preload/index.js");
  return existsSync(mjs) ? mjs : js;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0c0d10",
    title: `Forge ${app.getVersion()}`,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("Renderer failed to load", { code, desc, url });
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.error("[renderer]", message);
  });
  win.show();
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("app.phumi.forge");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
  registerRuntime(app.getPath("userData"));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
