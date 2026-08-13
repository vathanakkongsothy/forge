import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  EMPTY_BROWSER,
  isRecordableBrowserUrl,
  type Activity,
  type AppSettings,
  type BrowserHistoryEntry,
  type BrowserSessionState,
  type ChatBlock,
  type PendingDiff,
  type Project,
  type SshProfile,
  type DbProfile,
  type Thread,
  type ThreadStatus,
  type TodoItem,
} from "@forge/shared";

export type PersistedState = {
  projects: Project[];
  threads: Thread[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  settings: AppSettings;
  sshProfiles: SshProfile[];
  dbProfiles: DbProfile[];
};

const EMPTY: PersistedState = {
  projects: [],
  threads: [],
  activeProjectId: null,
  activeThreadId: null,
  settings: DEFAULT_SETTINGS,
  sshProfiles: [],
  dbProfiles: [],
};

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run: (...args: unknown[]) => void;
    get: (...args: unknown[]) => { payload?: string } | undefined;
  };
};

function tryOpenSqlite(file: string): SqliteDb | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as new (p: string) => SqliteDb;
    const db = new Database(file);
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
    `);
    return db;
  } catch {
    return null;
  }
}

export class WorkspaceDatabase {
  private jsonPath: string;
  private sqlite: SqliteDb | null;
  private data: PersistedState = structuredClone(EMPTY);

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.jsonPath = path.join(userDataDir, "workspace.json");
    this.sqlite = tryOpenSqlite(path.join(userDataDir, "forge.sqlite"));
    this.load();
    this.clearStaleRunning();
  }

  private load(): void {
    try {
      if (this.sqlite) {
        const row = this.sqlite.prepare("SELECT payload FROM kv WHERE key = ?").get("state");
        if (row?.payload) {
          this.data = hydrate(JSON.parse(row.payload) as PersistedState);
          return;
        }
      }
      if (fs.existsSync(this.jsonPath)) {
        this.data = hydrate(JSON.parse(fs.readFileSync(this.jsonPath, "utf8")) as PersistedState);
      }
    } catch {
      this.data = structuredClone(EMPTY);
    }
  }

  save(): void {
    const payload = JSON.stringify(this.data);
    if (this.sqlite) {
      this.sqlite.prepare("INSERT OR REPLACE INTO kv (key, payload) VALUES (?, ?)").run("state", payload);
    }
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.data, null, 2), "utf8");
  }

  snapshot(): PersistedState {
    return this.data;
  }

  get settings(): AppSettings {
    return this.data.settings;
  }

  setSettings(partial: Partial<AppSettings>): void {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
  }

  get sshProfiles(): SshProfile[] {
    return this.data.sshProfiles;
  }

  upsertSshProfile(profile: SshProfile): SshProfile {
    const index = this.data.sshProfiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) this.data.sshProfiles[index] = profile;
    else this.data.sshProfiles.unshift(profile);
    this.save();
    return profile;
  }

  removeSshProfile(id: string): void {
    this.data.sshProfiles = this.data.sshProfiles.filter((item) => item.id !== id);
    this.save();
  }

  getSshProfile(id: string): SshProfile | null {
    return this.data.sshProfiles.find((item) => item.id === id) ?? null;
  }

  get dbProfiles(): DbProfile[] {
    return this.data.dbProfiles;
  }

  upsertDbProfile(profile: DbProfile): DbProfile {
    const index = this.data.dbProfiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) this.data.dbProfiles[index] = profile;
    else this.data.dbProfiles.unshift(profile);
    this.save();
    return profile;
  }

  removeDbProfile(id: string): void {
    this.data.dbProfiles = this.data.dbProfiles.filter((item) => item.id !== id);
    this.save();
  }

  getDbProfile(id: string): DbProfile | null {
    return this.data.dbProfiles.find((item) => item.id === id) ?? null;
  }

  get projects(): Project[] {
    return this.data.projects;
  }

  get threads(): Thread[] {
    return this.data.threads;
  }

  get activeProject(): Project | null {
    return this.data.projects.find((p) => p.id === this.data.activeProjectId) ?? null;
  }

  get activeThread(): Thread | null {
    return this.data.threads.find((t) => t.id === this.data.activeThreadId) ?? null;
  }

  get activeProjectId(): string | null {
    return this.data.activeProjectId;
  }

  get activeThreadId(): string | null {
    return this.data.activeThreadId;
  }

  upsertProject(folderPath: string): Project {
    const existing = this.data.projects.find((p) => p.path === folderPath);
    const now = Date.now();
    if (existing) {
      existing.lastOpenedAt = now;
      this.data.activeProjectId = existing.id;
      const first = this.data.threads.find((t) => t.projectId === existing.id);
      this.data.activeThreadId = first?.id ?? this.createThread(existing.id).id;
      this.save();
      return existing;
    }
    const project: Project = {
      id: randomUUID(),
      path: folderPath,
      name: path.basename(folderPath) || folderPath,
      lastOpenedAt: now,
    };
    this.data.projects.unshift(project);
    this.data.activeProjectId = project.id;
    this.createThread(project.id);
    this.save();
    return project;
  }

  createThread(projectId: string): Thread {
    const thread: Thread = {
      id: randomUUID(),
      projectId,
      title: "New thread",
      status: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worktreePath: null,
      blocks: [],
      diffs: [],
      todos: [],
      activities: [],
    };
    this.data.threads.unshift(thread);
    this.data.activeThreadId = thread.id;
    this.save();
    return thread;
  }

  selectThread(threadId: string): Thread | null {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    this.data.activeThreadId = thread.id;
    this.data.activeProjectId = thread.projectId;
    this.save();
    return thread;
  }

  getThread(threadId: string): Thread | null {
    return this.data.threads.find((t) => t.id === threadId) ?? null;
  }

  projectForThread(threadId: string): Project | null {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    return this.data.projects.find((p) => p.id === thread.projectId) ?? null;
  }

  workspaceRoot(threadId: string): string | null {
    const thread = this.getThread(threadId);
    const project = this.projectForThread(threadId);
    if (!thread || !project) return null;
    return thread.worktreePath || project.path;
  }

  setThreadStatus(threadId: string, status: ThreadStatus): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.status = status;
    thread.updatedAt = Date.now();
    this.save();
  }

  setThreadTitle(threadId: string, title: string): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.title = title.slice(0, 80);
    this.save();
  }

  addBlock(threadId: string, block: ChatBlock): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.blocks.push(block);
    thread.updatedAt = Date.now();
    this.save();
  }

  updateBlock(threadId: string, blockId: string, patch: Partial<ChatBlock>): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const index = thread.blocks.findIndex((b) => b.id === blockId);
    if (index < 0) return;
    thread.blocks[index] = { ...thread.blocks[index], ...patch } as ChatBlock;
    this.save();
  }

  appendAssistantText(threadId: string, blockId: string, delta: string): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const block = thread.blocks.find((b) => b.id === blockId);
    if (!block || block.kind !== "assistant") return;
    block.text += delta;
    thread.updatedAt = Date.now();
  }

  appendReasoning(threadId: string, blockId: string, delta: string): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const block = thread.blocks.find((b) => b.id === blockId);
    if (!block || block.kind !== "reasoning") return;
    block.text += delta;
  }

  addDiff(threadId: string, diff: PendingDiff): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.diffs.unshift(diff);
    thread.status = "needs_review";
    this.save();
  }

  updateDiff(threadId: string, diffId: string, status: PendingDiff["status"]): PendingDiff | null {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    const diff = thread.diffs.find((d) => d.id === diffId);
    if (!diff) return null;
    diff.status = status;
    if (!thread.diffs.some((d) => d.status === "pending") && thread.status === "needs_review") {
      thread.status = "idle";
    }
    this.save();
    return diff;
  }

  setTodos(threadId: string, todos: TodoItem[]): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.todos = todos;
    this.save();
  }

  addActivity(threadId: string, activity: Activity): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.activities.unshift(activity);
    thread.activities = thread.activities.slice(0, 200);
    this.save();
  }

  updateActivity(threadId: string, activity: Activity): void {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const index = thread.activities.findIndex((a) => a.id === activity.id);
    if (index >= 0) thread.activities[index] = activity;
    else thread.activities.unshift(activity);
    this.save();
  }

  runningThreadId(): string | null {
    return this.data.threads.find((t) => t.status === "running")?.id ?? null;
  }

  clearStaleRunning(): string[] {
    const cleared: string[] = [];
    for (const thread of this.data.threads) {
      if (thread.status !== "running") continue;
      thread.status = "idle";
      thread.updatedAt = Date.now();
      cleared.push(thread.id);
    }
    if (cleared.length) this.save();
    return cleared;
  }

  browserState(projectId = this.data.activeProjectId): BrowserSessionState {
    const project = this.data.projects.find((p) => p.id === projectId);
    return cloneBrowser(project?.browser);
  }

  recordBrowserVisit(
    url: string,
    title?: string,
    mode: "push" | "replace" | "traverse" = "push",
    projectId = this.data.activeProjectId,
  ): BrowserSessionState {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project || !isRecordableBrowserUrl(url)) return this.browserState(projectId);
    const session = cloneBrowser(project.browser);
    const entry: BrowserHistoryEntry = { url, title, visitedAt: Date.now() };
    if (mode === "push") {
      const current = session.stack[session.index];
      if (current?.url === url) {
        session.stack[session.index] = { ...current, title: title || current.title, visitedAt: entry.visitedAt };
      } else {
        session.stack = [...session.stack.slice(0, session.index + 1), entry].slice(-80);
        session.index = session.stack.length - 1;
      }
    } else if (mode === "replace" && session.index >= 0) {
      session.stack[session.index] = { ...session.stack[session.index], ...entry };
    }
    session.lastUrl = url;
    const lastVisit = session.visits[0];
    if (lastVisit?.url === url) {
      session.visits[0] = { ...lastVisit, title: title || lastVisit.title, visitedAt: entry.visitedAt };
    } else {
      session.visits = [entry, ...session.visits.filter((v) => v.url !== url)].slice(0, 150);
    }
    project.browser = session;
    this.save();
    return session;
  }

  traverseBrowser(delta: number, projectId = this.data.activeProjectId): BrowserSessionState | null {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const session = cloneBrowser(project.browser);
    const next = session.index + delta;
    if (next < 0 || next >= session.stack.length) return session;
    session.index = next;
    session.lastUrl = session.stack[next]?.url ?? session.lastUrl;
    project.browser = session;
    this.save();
    return session;
  }

  clearBrowserHistory(projectId = this.data.activeProjectId): BrowserSessionState {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) return { ...EMPTY_BROWSER };
    project.browser = cloneBrowser();
    this.save();
    return project.browser;
  }
}

function cloneBrowser(session?: BrowserSessionState): BrowserSessionState {
  if (!session) return { ...EMPTY_BROWSER, stack: [], visits: [] };
  return {
    lastUrl: session.lastUrl ?? "",
    stack: [...(session.stack ?? [])],
    index: typeof session.index === "number" ? session.index : -1,
    visits: [...(session.visits ?? [])],
  };
}

function hydrate(parsed: PersistedState): PersistedState {
  return {
    ...EMPTY,
    ...parsed,
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    sshProfiles: parsed.sshProfiles ?? [],
    dbProfiles: parsed.dbProfiles ?? [],
    projects: (parsed.projects ?? []).map((p) => ({
      ...p,
      browser: cloneBrowser(p.browser),
    })),
    threads: (parsed.threads ?? []).map((t) => ({
      ...t,
      blocks: t.blocks ?? [],
      diffs: t.diffs ?? [],
      todos: t.todos ?? [],
      activities: t.activities ?? [],
    })),
  };
}
