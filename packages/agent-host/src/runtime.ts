import { exec, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runAgent, stopAgent } from "@forge/agent-core";
import type { BrowserWorkspace } from "@forge/browser";
import { WorkspaceDatabase } from "@forge/database";
import { gitCommit, gitSnapshot, gitStage, gitUnstage } from "@forge/git";
import { clearGrokSession, loginWithGrokOAuth } from "@forge/oauth";
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
import { getAuthStatus, hasApiKey, resolveAccessToken, saveApiKey } from "./secrets";

type Listener = (event: AgentStreamEvent | { type: "term-data"; id: string; chunk: string }) => void;

export class ForgeRuntime {
  readonly db: WorkspaceDatabase;
  private readonly terminals = new TerminalManager();
  private readonly approvals = new Map<string, (allow: boolean) => void>();
  private readonly detectedUrls = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private readonly dataDir: string;
  readonly browserHolder: { current?: BrowserWorkspace } = {};
  private defaultTerminalId = "term-1";

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.db = new WorkspaceDatabase(dataDir);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentStreamEvent | { type: "term-data"; id: string; chunk: string }): void {
    for (const listener of this.listeners) listener(event);
  }

  state(): AppState {
    const snap = this.db.snapshot();
    return {
      ...snap,
      version: APP_VERSION,
      hasApiKey: hasApiKey(this.dataDir),
      auth: getAuthStatus(this.dataDir),
      detectedUrls: [...this.detectedUrls],
      browser: this.db.browserState(),
    };
  }

  pushState(): AppState {
    const next = this.state();
    this.emit({ type: "state", state: next });
    return next;
  }

  async dispatch(method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case "getState":
        return this.state();
      case "pickFolder":
      case "openProject": {
        const folderPath = String(p.path ?? p.folderPath ?? "");
        if (!folderPath) throw new Error("Folder path required");
        this.db.upsertProject(folderPath);
        return this.pushState();
      }
      case "createThread": {
        const project = this.db.activeProject;
        if (!project) throw new Error("Open a folder first.");
        this.db.createThread(project.id);
        return this.pushState();
      }
      case "selectThread":
        this.db.selectThread(String(p.id ?? p.threadId));
        return this.pushState();
      case "listDir": {
        const root = this.db.activeProject?.path;
        if (!root) return [];
        return listDirectory(root, String(p.path ?? "."));
      }
      case "readFile": {
        const root = this.db.activeProject?.path;
        if (!root) throw new Error("No project");
        const rel = String(p.path);
        return { path: rel, contents: readFileRaw(root, rel), language: languageFromPath(rel) };
      }
      case "writeUserFile": {
        const root = this.db.activeProject?.path;
        if (!root) throw new Error("No project");
        writeFileText(root, String(p.path), String(p.contents));
        return { ok: true };
      }
      case "createPath": {
        const root = this.db.activeProject?.path;
        if (!root) throw new Error("No project");
        if (p.type === "dir") createDirectory(root, String(p.path));
        else writeFileText(root, String(p.path), "");
        return { ok: true };
      }
      case "deletePath": {
        const root = this.db.activeProject?.path;
        if (!root) throw new Error("No project");
        const ok = await this.askUi("delete_file", `Delete ${p.path}`, String(p.path));
        if (!ok) return { ok: false };
        deletePath(root, String(p.path));
        return { ok: true };
      }
      case "renamePath": {
        const root = this.db.activeProject?.path;
        if (!root) throw new Error("No project");
        renamePath(root, String(p.from), String(p.to));
        return { ok: true };
      }
      case "gitSnapshot": {
        const root = this.db.activeProject?.path;
        if (!root) return null;
        return gitSnapshot(root);
      }
      case "gitStage":
        return gitStage(requiredRoot(this), String(p.path));
      case "gitUnstage":
        return gitUnstage(requiredRoot(this), String(p.path));
      case "gitCommit": {
        const ok = await this.askUi("git_commit", `Commit: ${p.message}`, String(p.message));
        if (!ok) return "denied";
        return gitCommit(requiredRoot(this), String(p.message));
      }
      case "acceptDiff":
        this.db.updateDiff(String(p.threadId), String(p.diffId), "accepted");
        return this.pushState();
      case "rejectDiff": {
        const thread = this.db.getThread(String(p.threadId));
        const root = this.db.workspaceRoot(String(p.threadId));
        const diff = thread?.diffs.find((d) => d.id === p.diffId);
        if (root && diff) restoreFile(root, diff.path, diff.before);
        this.db.updateDiff(String(p.threadId), String(p.diffId), "rejected");
        return this.pushState();
      }
      case "setApiKey":
        saveApiKey(this.dataDir, String(p.key ?? ""));
        return this.pushState();
      case "oauthLogin":
        await loginWithGrokOAuth((url) => {
          const command =
            process.platform === "win32"
              ? `start "" "${url}"`
              : process.platform === "darwin"
                ? `open "${url}"`
                : `xdg-open "${url}"`;
          exec(command);
        });
        return this.pushState();
      case "oauthLogout":
        clearGrokSession();
        return this.pushState();
      case "setSettings":
        this.db.setSettings(p as { model?: string; approvalMode?: "ask" | "allowlist" });
        return this.pushState();
      case "termCreate": {
        const cwd = String(p.cwd || this.db.activeProject?.path || process.cwd());
        const id = String(p.id);
        this.defaultTerminalId = id;
        this.terminals.create(id, cwd, (termId, chunk) => {
          for (const url of detectLocalUrls(chunk)) {
            this.detectedUrls.add(url);
            this.emit({ type: "dev-server", url });
          }
          this.emit({ type: "term-data", id: termId, chunk });
        });
        return { id, cwd };
      }
      case "termWrite":
        this.terminals.write(String(p.id), String(p.data));
        return { ok: true };
      case "termResize":
        this.terminals.resize(String(p.id), Number(p.cols), Number(p.rows));
        return { ok: true };
      case "termKill":
        this.terminals.kill(String(p.id));
        return { ok: true };
      case "browserAttach":
        return { ok: true };
      case "browserInspect":
        await this.browserHolder.current?.setInspect(Boolean(p.enabled));
        return { ok: true };
      case "browserNavigate": {
        const next = normalizeBrowserUrl(String(p.url));
        this.db.recordBrowserVisit(next);
        await this.browserHolder.current?.navigate(next).catch(() => undefined);
        return this.pushState();
      }
      case "browserRecord":
        this.db.recordBrowserVisit(normalizeBrowserUrl(String(p.url)), p.title ? String(p.title) : undefined);
        return this.pushState();
      case "browserBack":
        this.db.traverseBrowser(-1);
        return this.pushState();
      case "browserForward":
        this.db.traverseBrowser(1);
        return this.pushState();
      case "browserClearHistory":
        this.db.clearBrowserHistory();
        return this.pushState();
      case "sendMessage":
        return this.sendMessage(String(p.threadId), String(p.text));
      case "stop":
        stopAgent(String(p.threadId));
        return { ok: true };
      case "respondApproval": {
        this.approvals.get(String(p.requestId))?.(Boolean(p.allow));
        this.approvals.delete(String(p.requestId));
        return { ok: true };
      }
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async sendMessage(threadId: string, text: string): Promise<AppState> {
    const key = await resolveAccessToken(this.dataDir);
    if (!key) throw new Error("Sign in with Grok or add an XAI_API_KEY in Settings.");
    if (this.db.runningThreadId()) throw new Error("An agent is already running.");
    const root = this.db.workspaceRoot(threadId);
    if (!root) throw new Error("No workspace.");

    this.db.addBlock(threadId, { id: randomUUID(), kind: "user", text, createdAt: Date.now() });
    const thread = this.db.getThread(threadId);
    if (thread?.title === "New thread") {
      this.db.setThreadTitle(threadId, text.replace(/\s+/g, " ").slice(0, 56));
    }
    this.db.setThreadStatus(threadId, "running");
    this.pushState();

    const controller = new AbortController();
    void runAgent({
      apiKey: key,
      model: this.db.settings.model,
      workspaceRoot: root,
      threadId,
      userText: text,
      history: this.db.getThread(threadId)?.blocks ?? [],
      inspectedJson: this.browserHolder.current?.lastInspect
        ? JSON.stringify(this.browserHolder.current.lastInspect, null, 2)
        : undefined,
      abortSignal: controller.signal,
      context: {
        workspaceRoot: root,
        approvalMode: this.db.settings.approvalMode,
        abortSignal: controller.signal,
        requestPermission: async (_level, summary, detail) => this.askUi("agent", summary, detail, threadId),
        runCommand: (command) => this.runInProject(root, command),
        terminalOutput: (id) => this.terminals.output(id || this.defaultTerminalId),
        browser: () => this.browserHolder.current ?? null,
      },
      hooks: {
        onText: (blockId, delta) => {
          if (!this.db.getThread(threadId)?.blocks.some((b) => b.id === blockId)) {
            this.db.addBlock(threadId, { id: blockId, kind: "assistant", text: "", createdAt: Date.now() });
          }
          this.db.appendAssistantText(threadId, blockId, delta);
          this.emit({ type: "text-delta", threadId, blockId, text: delta });
        },
        onReasoning: (blockId, delta) => {
          if (!this.db.getThread(threadId)?.blocks.some((b) => b.id === blockId)) {
            this.db.addBlock(threadId, { id: blockId, kind: "reasoning", text: "", createdAt: Date.now() });
          }
          this.db.appendReasoning(threadId, blockId, delta);
          this.emit({ type: "reasoning", threadId, blockId, text: delta });
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
          const existing = this.db.getThread(threadId)?.blocks.find((b) => b.id === id);
          if (!existing) this.db.addBlock(threadId, { id, kind: "tool", tool: card });
          else this.db.updateBlock(threadId, id, { kind: "tool", tool: card });
          this.emit({ type: existing ? "tool-update" : "tool-start", threadId, tool: card });
        },
        onActivity: (activity) => {
          this.db.addActivity(threadId, activity);
          this.emit({ type: "activity", threadId, activity });
        },
        onDiff: (diff) => {
          this.db.addDiff(threadId, diff);
          this.emit({ type: "diff", threadId, diff });
          this.emit({ type: "state", state: this.state() });
        },
        onUrls: (urls) => {
          for (const url of urls) {
            this.detectedUrls.add(url);
            this.emit({ type: "dev-server", url });
          }
        },
      },
    })
      .catch((err) => {
        this.emit({
          type: "error",
          threadId,
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        const latest = this.db.getThread(threadId);
        const pending = latest?.diffs.some((d) => d.status === "pending");
        this.db.setThreadStatus(threadId, pending ? "needs_review" : "idle");
        this.emit({ type: "done", threadId });
        this.pushState();
      });

    return this.pushState();
  }

  private askUi(tool: string, summary: string, detail?: string, threadId = this.db.activeThreadId ?? "ui"): Promise<boolean> {
    const request: PermissionRequest = {
      requestId: randomUUID(),
      threadId,
      tool,
      summary,
      detail,
    };
    this.emit({ type: "approval", request });
    return new Promise((resolve) => {
      this.approvals.set(request.requestId, resolve);
    });
  }

  private runInProject(root: string, command: string): Promise<{ output: string; urls: string[] }> {
    return new Promise((resolve, reject) => {
      const isDev = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b/i.test(command);
      const child = spawn(command, { cwd: root, shell: true, windowsHide: !isDev });
      let output = "";
      const urls = new Set<string>();
      const onChunk = (buf: Buffer) => {
        const text = buf.toString("utf8");
        output = (output + text).slice(-20_000);
        for (const url of detectLocalUrls(text)) {
          urls.add(url);
          this.detectedUrls.add(url);
          this.emit({ type: "dev-server", url });
        }
        this.terminals.write(this.defaultTerminalId, text);
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
    });
  }
}

function requiredRoot(runtime: ForgeRuntime): string {
  const root = runtime.db.activeProject?.path;
  if (!root) throw new Error("No project");
  return root;
}
