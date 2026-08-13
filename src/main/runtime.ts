import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, watch, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, webContents } from "electron";
import { clearGrokSession, loginWithGrokOAuth } from "@forge/oauth";
import { isAgentRunning, runAgent, stopAgent } from "@forge/agent-core";
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
  type DbConnectionState,
  type DbEditOp,
  type DbProfileInput,
  type SshConnectionState,
  type SshProfileInput,
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
import { isMutatingSql, openDatabase, type LiveDb } from "./db-manager";
import { deleteDbSecret, readDbSecret, saveDbSecret } from "./db-secrets";
import { createSshSession } from "./ssh";
import { deleteSshSecret, readSshSecret, saveSshSecret } from "./ssh-secrets";

const terminals = new TerminalManager();
const approvals = new Map<string, (allow: boolean) => void>();
let db: WorkspaceDatabase;
const detectedUrls = new Set<string>();
const browserHolder: { current?: BrowserWorkspace } = {};
const sshStatus = new Map<string, SshConnectionState>();
const dbLive = new Map<string, LiveDb>();
const dbStatus = new Map<string, DbConnectionState>();
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
    browserAttached: Boolean(browserHolder.current),
    sshProfiles: db.sshProfiles,
    sshConnections: db.sshProfiles.map(
      (profile) => sshStatus.get(profile.id) ?? { profileId: profile.id, status: "disconnected" as const },
    ),
    dbProfiles: db.dbProfiles,
    dbConnections: db.dbProfiles.map(
      (profile) => dbStatus.get(profile.id) ?? { profileId: profile.id, status: "disconnected" as const },
    ),
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
  applyWindowBackground(db.settings.theme);
  nativeTheme.on("updated", () => {
    if ((db.settings.theme ?? "system") === "system") applyWindowBackground("system");
  });

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

  ipcMain.handle("forge:openLink", async (_e, href: string) => {
    const raw = String(href ?? "").trim();
    if (!raw || /^javascript:/i.test(raw)) return { ok: false, action: "ignore" };
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)?/i.test(raw)) {
      const url = normalizeBrowserUrl(raw);
      db.recordBrowserVisit(url);
      emit({ type: "browser-focus", url });
      await browserHolder.current?.navigate(url).catch(() => undefined);
      return { ok: true, action: "browser" };
    }
    if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) {
      await shell.openExternal(raw);
      return { ok: true, action: "external" };
    }
    const root = db.activeProject?.path;
    if (!root) return { ok: false, action: "ignore" };
    let candidate = raw.startsWith("file:") ? fileURLToPath(raw) : raw.replace(/^<|>$/g, "");
    if (!path.isAbsolute(candidate)) candidate = path.resolve(root, candidate);
    const rel = path.relative(root, candidate);
    if (rel.startsWith("..") || path.isAbsolute(rel) || !existsSync(candidate)) {
      return { ok: false, action: "ignore" };
    }
    emit({ type: "open-file", path: candidate });
    return { ok: true, action: "file" };
  });

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
    if (partial.theme) applyWindowBackground(partial.theme);
    return pushState();
  });

  ipcMain.handle("forge:sshSave", (_e, input: SshProfileInput) => {
    const id = input.id || randomUUID();
    if (input.secret) saveSshSecret(id, input.secret);
    else if (input.clearSecret) deleteSshSecret(id);
    const existing = db.getSshProfile(id);
    db.upsertSshProfile({
      id,
      name: input.name.trim() || `${input.username}@${input.host}`,
      host: input.host.trim(),
      port: Number(input.port) || 22,
      username: input.username.trim(),
      auth: input.auth,
      keyPath: input.keyPath?.trim() || undefined,
      hasSecret: Boolean(readSshSecret(id)),
      lastConnectedAt: existing?.lastConnectedAt,
    });
    return pushState();
  });

  ipcMain.handle("forge:sshDelete", (_e, id: string) => {
    terminals.kill(`ssh-${id}`);
    deleteSshSecret(id);
    sshStatus.delete(id);
    db.removeSshProfile(id);
    return pushState();
  });

  ipcMain.handle("forge:sshConnect", (_e, id: string) => {
    const profile = db.getSshProfile(id);
    if (!profile) throw new Error("SSH session not found.");
    if (!profile.host || !profile.username) throw new Error("Host and username are required.");
    if (!db.activeProject) {
      const dir = path.join(app.getPath("userData"), "remotes", profile.id);
      mkdirSync(dir, { recursive: true });
      const note = path.join(dir, "README.md");
      if (!existsSync(note)) {
        writeFileSync(note, `# ${profile.name}\n\nSSH ${profile.username}@${profile.host}:${profile.port}\n`, "utf8");
      }
      db.upsertProject(dir);
    }
    const termId = `ssh-${profile.id}`;
    const session = createSshSession(
      termId,
      { profile, secret: readSshSecret(profile.id) },
      (status, error) => {
        sshStatus.set(profile.id, { profileId: profile.id, status, error });
        if (status === "connected") {
          db.upsertSshProfile({ ...profile, lastConnectedAt: Date.now() });
        }
        pushState();
      },
    );
    terminals.adopt(session, (sid, chunk) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("forge:term-data", { id: sid, chunk });
      }
    });
    defaultTerminalId = termId;
    emit({ type: "ssh-term", id: termId, title: profile.name });
    return pushState();
  });

  ipcMain.handle("forge:sshDisconnect", (_e, id: string) => {
    terminals.kill(`ssh-${id}`);
    sshStatus.set(id, { profileId: id, status: "disconnected" });
    return pushState();
  });

  ipcMain.handle("forge:sshPickKey", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = { title: "Choose a private key", properties: ["openFile"] as Array<"openFile"> };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("forge:dbSave", (_e, input: DbProfileInput) => {
    const id = input.id || randomUUID();
    if (input.secret) saveDbSecret(id, input.secret);
    else if (input.clearSecret) deleteDbSecret(id);
    const existing = db.getDbProfile(id);
    db.upsertDbProfile({
      id,
      name: input.name.trim() || input.database || input.filePath || input.host || "Database",
      engine: input.engine,
      host: input.host?.trim() || undefined,
      port: Number(input.port) || (input.engine === "postgres" ? 5432 : input.engine === "mysql" ? 3306 : undefined),
      username: input.username?.trim() || undefined,
      database: input.database?.trim() || undefined,
      filePath: input.filePath?.trim() || undefined,
      ssl: Boolean(input.ssl),
      hasSecret: Boolean(readDbSecret(id)),
      lastConnectedAt: existing?.lastConnectedAt,
    });
    return pushState();
  });

  ipcMain.handle("forge:dbDelete", async (_e, id: string) => {
    await dbLive.get(id)?.close().catch(() => undefined);
    dbLive.delete(id);
    dbStatus.delete(id);
    deleteDbSecret(id);
    db.removeDbProfile(id);
    return pushState();
  });

  ipcMain.handle("forge:dbConnect", async (_e, id: string) => {
    const profile = db.getDbProfile(id);
    if (!profile) throw new Error("Database connection not found.");
    dbStatus.set(id, { profileId: id, status: "connecting" });
    pushState();
    try {
      await dbLive.get(id)?.close().catch(() => undefined);
      const live = await openDatabase(profile, readDbSecret(id));
      dbLive.set(id, live);
      db.upsertDbProfile({ ...profile, lastConnectedAt: Date.now() });
      dbStatus.set(id, { profileId: id, status: "connected", currentDatabase: live.currentDatabase() ?? profile.database });
    } catch (err) {
      dbLive.delete(id);
      dbStatus.set(id, {
        profileId: id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      pushState();
      throw err instanceof Error ? err : new Error(String(err));
    }
    return pushState();
  });

  ipcMain.handle("forge:dbDisconnect", async (_e, id: string) => {
    await dbLive.get(id)?.close().catch(() => undefined);
    dbLive.delete(id);
    dbStatus.set(id, { profileId: id, status: "disconnected" });
    return pushState();
  });

  ipcMain.handle("forge:dbDatabases", async (_e, id: string) => {
    const live = liveDb(id);
    const names = await live.databases();
    const current = live.currentDatabase();
    return names.map((name) => ({ name, current: name === current }));
  });

  ipcMain.handle("forge:dbOpen", async (_e, payload: { id: string; database: string }) => {
    const profile = db.getDbProfile(payload.id);
    if (!profile) throw new Error("Database connection not found.");
    if (profile.engine === "sqlite") throw new Error("SQLite has a single file database.");
    const name = String(payload.database ?? "").trim();
    if (!name) throw new Error("Database name is required.");
    const next = { ...profile, database: name, lastConnectedAt: Date.now() };
    dbStatus.set(payload.id, { profileId: payload.id, status: "connecting", currentDatabase: name });
    pushState();
    try {
      await dbLive.get(payload.id)?.close().catch(() => undefined);
      const live = await openDatabase(next, readDbSecret(payload.id));
      dbLive.set(payload.id, live);
      db.upsertDbProfile(next);
      dbStatus.set(payload.id, { profileId: payload.id, status: "connected", currentDatabase: live.currentDatabase() ?? name });
    } catch (err) {
      dbLive.delete(payload.id);
      dbStatus.set(payload.id, {
        profileId: payload.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      pushState();
      throw err instanceof Error ? err : new Error(String(err));
    }
    return pushState();
  });

  ipcMain.handle("forge:dbTables", async (_e, id: string) => {
    return liveDb(id).tables();
  });

  ipcMain.handle("forge:dbColumns", async (_e, payload: { id: string; table: string; schema?: string }) => {
    return liveDb(payload.id).columns(payload.table, payload.schema);
  });

  ipcMain.handle("forge:dbQuery", async (_e, payload: { id: string; sql: string; confirm?: boolean }) => {
    const sql = String(payload.sql ?? "").trim();
    if (!sql) throw new Error("SQL is empty.");
    if (isMutatingSql(sql) && !payload.confirm) {
      throw new Error("This statement changes data. Confirm to run it.");
    }
    return liveDb(payload.id).query(sql);
  });

  ipcMain.handle("forge:dbApplyEdits", async (_e, payload: { id: string; ops: DbEditOp[] }) => {
    const ops = Array.isArray(payload.ops) ? payload.ops : [];
    if (!ops.length) return { applied: 0 };
    return liveDb(payload.id).applyEdits(ops);
  });

  ipcMain.handle("forge:dbPickSqlite", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      title: "Open SQLite database",
      properties: ["openFile"] as Array<"openFile">,
      filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }, { name: "All files", extensions: ["*"] }],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
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
      emit({ type: "browser-focus", url });
      pushState();
    };
    pushState();
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
    const stale = db.runningThreadId();
    if (stale && !isAgentRunning(stale)) db.setThreadStatus(stale, "idle");
    if (isAgentRunning()) throw new Error("An agent is already running. Press Stop and try again.");
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
      browserBrief: await describeBrowser(),
      abortSignal: controller.signal,
      context: {
        workspaceRoot: root,
        approvalMode: db.settings.approvalMode,
        abortSignal: controller.signal,
        requestPermission: async (_level, summary, detail) => askUi("agent", summary, detail, payload.threadId),
        runCommand: (command) => runInProject(root, command, payload.threadId),
        terminalOutput: (id) => terminals.output(id || defaultTerminalId),
        browser: () => browserHolder.current ?? null,
        ensureBrowser,
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
            emit({ type: "browser-focus", url });
          }
        },
      },
    })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        db.addBlock(payload.threadId, {
          id: randomUUID(),
          kind: "assistant",
          text: `The agent stopped before it finished.\n\n${message}`,
          createdAt: Date.now(),
        });
        emit({
          type: "error",
          threadId: payload.threadId,
          message,
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
    const target = threadId || db.runningThreadId();
    if (target) db.setThreadStatus(target, "idle");
    for (const id of db.clearStaleRunning()) stopAgent(id);
    return pushState();
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

function liveDb(id: string): LiveDb {
  const live = dbLive.get(id);
  if (!live) throw new Error("Connect to the database first.");
  return live;
}

async function ensureBrowser(url?: string): Promise<import("@forge/browser").BrowserWorkspace> {
  const target = url ? normalizeBrowserUrl(url) : browserHolder.current?.currentUrl || db.browserState().lastUrl || "about:blank";
  emit({ type: "browser-focus", url: target });
  if (url && browserHolder.current) {
    await browserHolder.current.navigate(target).catch(() => undefined);
    return browserHolder.current;
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (browserHolder.current) {
      if (url) await browserHolder.current.navigate(target).catch(() => undefined);
      return browserHolder.current;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Browser did not attach. Click the Browser tab once, then try again.");
}

async function describeBrowser(): Promise<string> {
  const session = browserHolder.current;
  if (!session) return "status: disconnected — call browser_open to attach the preview.";
  let url = session.currentUrl;
  try {
    url = await session.getUrl();
  } catch {
    /* keep cached url */
  }
  const errors = session.consoleDump(true).slice(-6);
  const failed = session.networkDump(true).slice(-6);
  return [
    "status: connected",
    `url: ${url || "(blank)"}`,
    `inspect: ${session.lastInspect ? JSON.stringify(session.lastInspect) : "none"}`,
    `console errors: ${errors.length ? errors.map((e) => e.text).join(" | ") : "(none)"}`,
    `failed network: ${failed.length ? failed.map((n) => `${n.status ?? "fail"} ${n.url}`).join(" | ") : "(none)"}`,
  ].join("\n");
}

function applyWindowBackground(theme: string): void {
  const light = theme === "light" || (theme !== "dark" && !nativeTheme.shouldUseDarkColors);
  const color = light ? "#f5f6f8" : "#0c0d10";
  for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(color);
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
