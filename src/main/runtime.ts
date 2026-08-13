import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, webContents } from "electron";
import { clearGrokSession, loginWithGrokOAuth } from "@forge/oauth";
import { runAgent, stopAgent } from "@forge/agent-core";
import type { BrowserWorkspace } from "@forge/browser";
import { WorkspaceDatabase } from "@forge/database";
import { gitCommit, gitSnapshot, gitStage, gitUnstage } from "@forge/git";
import {
  APP_VERSION,
  detectLocalUrls,
  languageFromPath,
  normalizeBrowserUrl,
  type AgentStreamEvent,
  type AppState,
  type PermissionRequest,
} from "@forge/shared";
import { TerminalManager } from "@forge/terminal";
import {
  createDirectory,
  deletePath,
  listDirectory,
  readFileRaw,
  renamePath,
  restoreFile,
  writeFileText,
} from "@forge/tools";
import { attachBrowserWorkspace } from "./cdp";
import { getAuthStatus, hasApiKey, resolveAccessToken, saveApiKey } from "./secrets";

const terminals = new TerminalManager();
const approvals = new Map<string, (allow: boolean) => void>();
let db: WorkspaceDatabase;
const detectedUrls = new Set<string>();
const browserHolder: { current?: BrowserWorkspace } = {};
let defaultTerminalId = "term-1";

function emit(event: AgentStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("forge:event", event);
  }
}

function state(): AppState {
  const snap = db.snapshot();
  return {
    ...snap,
    version: app.getVersion() || APP_VERSION,
    hasApiKey: hasApiKey(),
    auth: getAuthStatus(),
    detectedUrls: [...detectedUrls],
    browser: db.browserState(),
  };
}

function pushState(): AppState {
  const next = state();
  emit({ type: "state", state: next });
  return next;
}

export function registerRuntime(userData: string): void {
  db = new WorkspaceDatabase(userData);
  watchGrokAuth();

  ipcMain.handle("forge:getState", () => state());

  ipcMain.handle("forge:pickFolder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = { title: "Open a workspace", properties: ["openDirectory"] as Array<"openDirectory"> };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || !result.filePaths[0]) return null;
    db.upsertProject(result.filePaths[0]);
    return pushState();
  });

  ipcMain.handle("forge:openProject", (_e, folderPath: string) => {
    db.upsertProject(folderPath);
    return pushState();
  });

  ipcMain.handle("forge:createThread", () => {
    const project = db.activeProject;
    if (!project) throw new Error("Open a folder first.");
    db.createThread(project.id);
    return pushState();
  });

  ipcMain.handle("forge:selectThread", (_e, threadId: string) => {
    db.selectThread(threadId);
    return pushState();
  });

  ipcMain.handle("forge:listDir", (_e, rel: string) => {
    const root = db.activeProject?.path;
    if (!root) return [];
    return listDirectory(root, rel || ".");
  });

  ipcMain.handle("forge:readFile", (_e, rel: string) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    return { path: rel, contents: readFileRaw(root, rel), language: languageFromPath(rel) };
  });

  ipcMain.handle("forge:writeUserFile", (_e, payload: { path: string; contents: string }) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    writeFileText(root, payload.path, payload.contents);
    return { ok: true };
  });

  ipcMain.handle("forge:createPath", (_e, payload: { path: string; type: "file" | "dir" }) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    if (payload.type === "dir") createDirectory(root, payload.path);
    else writeFileText(root, payload.path, "");
    return { ok: true };
  });

  ipcMain.handle("forge:deletePath", async (_e, rel: string) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    const ok = await askUi("delete_file", `Delete ${rel}`, rel);
    if (!ok) return { ok: false };
    deletePath(root, rel);
    return { ok: true };
  });

  ipcMain.handle("forge:renamePath", (_e, payload: { from: string; to: string }) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    renamePath(root, payload.from, payload.to);
    return { ok: true };
  });

  ipcMain.handle("forge:openExternal", (_e, target: string) => shell.openPath(target));

  ipcMain.handle("forge:gitSnapshot", () => {
    const root = db.activeProject?.path;
    if (!root) return null;
    return gitSnapshot(root);
  });

  ipcMain.handle("forge:gitStage", (_e, file: string) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    return gitStage(root, file);
  });

  ipcMain.handle("forge:gitUnstage", (_e, file: string) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    return gitUnstage(root, file);
  });

  ipcMain.handle("forge:gitCommit", async (_e, message: string) => {
    const root = db.activeProject?.path;
    if (!root) throw new Error("No project");
    const ok = await askUi("git_commit", `Commit: ${message}`, message);
    if (!ok) return "denied";
    return gitCommit(root, message);
  });

  ipcMain.handle("forge:acceptDiff", (_e, payload: { threadId: string; diffId: string }) => {
    db.updateDiff(payload.threadId, payload.diffId, "accepted");
    return pushState();
  });

  ipcMain.handle("forge:rejectDiff", (_e, payload: { threadId: string; diffId: string }) => {
    const thread = db.getThread(payload.threadId);
    const root = db.workspaceRoot(payload.threadId);
    const diff = thread?.diffs.find((d) => d.id === payload.diffId);
    if (root && diff) restoreFile(root, diff.path, diff.before);
    db.updateDiff(payload.threadId, payload.diffId, "rejected");
    return pushState();
  });

  ipcMain.handle("forge:setApiKey", (_e, key: string) => {
    saveApiKey(key);
    return pushState();
  });

  ipcMain.handle("forge:oauthLogin", async () => {
    await loginWithGrokOAuth((url) => shell.openExternal(url));
    return pushState();
  });

  ipcMain.handle("forge:oauthLogout", () => {
    clearGrokSession();
    return pushState();
  });

  ipcMain.handle("forge:setSettings", (_e, partial) => {
    db.setSettings(partial);
    return pushState();
  });

  ipcMain.handle("forge:termCreate", (_e, payload: { id: string; cwd?: string }) => {
    const cwd = payload.cwd || db.activeProject?.path || process.cwd();
    defaultTerminalId = payload.id;
    terminals.create(payload.id, cwd, (id, chunk) => {
      for (const url of detectLocalUrls(chunk)) {
        detectedUrls.add(url);
        emit({ type: "dev-server", url });
      }
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("forge:term-data", { id, chunk });
      }
    });
    return { id: payload.id, cwd };
  });

  ipcMain.handle("forge:termWrite", (_e, payload: { id: string; data: string }) => {
    terminals.write(payload.id, payload.data);
  });

  ipcMain.handle("forge:termResize", (_e, payload: { id: string; cols: number; rows: number }) => {
    terminals.resize(payload.id, payload.cols, payload.rows);
  });

  ipcMain.handle("forge:termKill", (_e, id: string) => {
    terminals.kill(id);
  });

  ipcMain.handle("forge:browserAttach", (_e, wcId: number) => {
    const wc = webContents.fromId(wcId);
    if (!wc) throw new Error("Unknown webContents");
    const session = attachBrowserWorkspace(wc, browserHolder);
    session.onNavigate = (url) => {
      db.recordBrowserVisit(url);
      pushState();
    };
    return { ok: true };
  });

  ipcMain.handle("forge:browserInspect", async (_e, enabled: boolean) => {
    await browserHolder.current?.setInspect(enabled);
    return { ok: true };
  });

  ipcMain.handle("forge:browserNavigate", async (_e, url: string) => {
    const next = normalizeBrowserUrl(url);
    db.recordBrowserVisit(next);
    await browserHolder.current?.navigate(next).catch(() => undefined);
    return pushState();
  });

  ipcMain.handle("forge:browserRecord", (_e, payload: { url: string; title?: string }) => {
    db.recordBrowserVisit(normalizeBrowserUrl(payload.url), payload.title);
    return pushState();
  });

  ipcMain.handle("forge:browserBack", () => {
    db.traverseBrowser(-1);
    return pushState();
  });

  ipcMain.handle("forge:browserForward", () => {
    db.traverseBrowser(1);
    return pushState();
  });

  ipcMain.handle("forge:browserClearHistory", () => {
    db.clearBrowserHistory();
    return pushState();
  });

  ipcMain.handle("forge:sendMessage", async (_e, payload: { threadId: string; text: string }) => {
    const key = await resolveAccessToken();
    if (!key) throw new Error("Sign in with Grok or add an XAI_API_KEY in Settings.");
    if (db.runningThreadId()) throw new Error("An agent is already running.");
    const root = db.workspaceRoot(payload.threadId);
    if (!root) throw new Error("No workspace.");

    db.addBlock(payload.threadId, {
      id: randomUUID(),
      kind: "user",
      text: payload.text,
      createdAt: Date.now(),
    });
    const thread = db.getThread(payload.threadId);
    if (thread?.title === "New thread") {
      db.setThreadTitle(payload.threadId, payload.text.replace(/\s+/g, " ").slice(0, 56));
    }
    db.setThreadStatus(payload.threadId, "running");
    pushState();

    const controller = new AbortController();
    void runAgent({
      apiKey: key,
      model: db.settings.model,
      workspaceRoot: root,
      threadId: payload.threadId,
      userText: payload.text,
      history: db.getThread(payload.threadId)?.blocks ?? [],
      inspectedJson: browserHolder.current?.lastInspect
        ? JSON.stringify(browserHolder.current.lastInspect, null, 2)
        : undefined,
      abortSignal: controller.signal,
      context: {
        workspaceRoot: root,
        approvalMode: db.settings.approvalMode,
        abortSignal: controller.signal,
        requestPermission: async (_level, summary, detail) => askUi("agent", summary, detail, payload.threadId),
        runCommand: (command) => runInProject(root, command, payload.threadId),
        terminalOutput: (id) => terminals.output(id || defaultTerminalId),
        browser: () => browserHolder.current ?? null,
      },
      hooks: {
        onText: (blockId, delta) => {
          if (!db.getThread(payload.threadId)?.blocks.some((b) => b.id === blockId)) {
            db.addBlock(payload.threadId, { id: blockId, kind: "assistant", text: "", createdAt: Date.now() });
          }
          db.appendAssistantText(payload.threadId, blockId, delta);
          emit({ type: "text-delta", threadId: payload.threadId, blockId, text: delta });
        },
        onReasoning: (blockId, delta) => {
          if (!db.getThread(payload.threadId)?.blocks.some((b) => b.id === blockId)) {
            db.addBlock(payload.threadId, { id: blockId, kind: "reasoning", text: "", createdAt: Date.now() });
          }
          db.appendReasoning(payload.threadId, blockId, delta);
          emit({ type: "reasoning", threadId: payload.threadId, blockId, text: delta });
        },
        onTool: (id, name, args, status, output) => {
          const card = {
            id,
            name,
            args,
            status: status as "running" | "done" | "error" | "waiting",
            output,
            startedAt: Date.now(),
            endedAt: status === "running" ? undefined : Date.now(),
          };
          const existing = db.getThread(payload.threadId)?.blocks.find((b) => b.id === id);
          if (!existing) db.addBlock(payload.threadId, { id, kind: "tool", tool: card });
          else db.updateBlock(payload.threadId, id, { kind: "tool", tool: card });
          emit({
            type: existing ? "tool-update" : "tool-start",
            threadId: payload.threadId,
            tool: card,
          });
        },
        onActivity: (activity) => {
          db.addActivity(payload.threadId, activity);
          emit({ type: "activity", threadId: payload.threadId, activity });
        },
        onDiff: (diff) => {
          db.addDiff(payload.threadId, diff);
          emit({ type: "diff", threadId: payload.threadId, diff });
          emit({ type: "state", state: state() });
        },
        onUrls: (urls) => {
          for (const url of urls) {
            detectedUrls.add(url);
            emit({ type: "dev-server", url });
          }
        },
      },
    })
      .catch((err) => {
        emit({
          type: "error",
          threadId: payload.threadId,
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        const latest = db.getThread(payload.threadId);
        const pending = latest?.diffs.some((d) => d.status === "pending");
        db.setThreadStatus(payload.threadId, pending ? "needs_review" : "idle");
        emit({ type: "done", threadId: payload.threadId });
        pushState();
      });

    return pushState();
  });

  ipcMain.handle("forge:stop", (_e, threadId: string) => {
    stopAgent(threadId);
    return { ok: true };
  });

  ipcMain.handle("forge:respondApproval", (_e, payload: { requestId: string; allow: boolean }) => {
    approvals.get(payload.requestId)?.(payload.allow);
    approvals.delete(payload.requestId);
    return { ok: true };
  });
}

function askUi(tool: string, summary: string, detail?: string, threadId = db.activeThreadId ?? "ui"): Promise<boolean> {
  const request: PermissionRequest = {
    requestId: randomUUID(),
    threadId,
    tool,
    summary,
    detail,
  };
  emit({ type: "approval", request });
  return new Promise((resolve) => {
    approvals.set(request.requestId, resolve);
  });
}

function runInProject(
  root: string,
  command: string,
  threadId: string,
): Promise<{ output: string; urls: string[] }> {
  return new Promise((resolve, reject) => {
    const isDev = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b/i.test(command);
    const child = spawn(command, {
      cwd: root,
      shell: true,
      windowsHide: !isDev,
    });
    let output = "";
    const urls = new Set<string>();
    const onChunk = (buf: Buffer) => {
      const text = buf.toString("utf8");
      output = (output + text).slice(-20_000);
      for (const url of detectLocalUrls(text)) {
        urls.add(url);
        detectedUrls.add(url);
        emit({ type: "dev-server", url });
      }
      terminals.write(defaultTerminalId, text);
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("error", reject);
    if (isDev) {
      setTimeout(() => {
        resolve({
          output: output || `Started ${command}. Watch the terminal and browser for the local URL.`,
          urls: [...urls],
        });
      }, 2500);
      return;
    }
    child.on("close", (code) => {
      resolve({ output: `${output}\nexit ${code ?? "?"}`, urls: [...urls] });
    });
    void threadId;
  });
}

function watchGrokAuth(): void {
  const dir = process.env.GROK_HOME?.trim() || path.join(os.homedir(), ".grok");
  try {
    mkdirSync(dir, { recursive: true });
    watch(dir, (_event, filename) => {
      if (filename && filename !== "auth.json") return;
      pushState();
    });
  } catch {
    /* auth file may be unavailable */
  }
}
