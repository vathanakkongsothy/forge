export const APP_NAME = "Forge";
export const APP_VERSION = "0.3.0";

export const MODELS = [
  { id: "grok-4.6", label: "Grok 4.6" },
  { id: "grok-4.5", label: "Grok 4.5" },
  { id: "grok-build-0.1", label: "Grok Build 0.1" },
] as const;

export type PermissionLevel = "safe" | "ask";

export type ThreadStatus = "idle" | "running" | "needs_review" | "error";

export type ActivityStatus = "running" | "done" | "error" | "waiting";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

export type BrowserHistoryEntry = {
  url: string;
  title?: string;
  visitedAt: number;
};

export type BrowserSessionState = {
  lastUrl: string;
  stack: BrowserHistoryEntry[];
  index: number;
  visits: BrowserHistoryEntry[];
};

export const EMPTY_BROWSER: BrowserSessionState = {
  lastUrl: "",
  stack: [],
  index: -1,
  visits: [],
};

export type Project = {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
  browser?: BrowserSessionState;
};

export type PendingDiff = {
  id: string;
  path: string;
  before: string;
  after: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: number;
};

export type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type Activity = {
  id: string;
  threadId: string;
  title: string;
  detail?: string;
  status: ActivityStatus;
  createdAt: number;
  endedAt?: number;
};

export type ToolCard = {
  id: string;
  name: string;
  args: unknown;
  status: ActivityStatus | "waiting_approval";
  output?: string;
  startedAt: number;
  endedAt?: number;
};

export type ChatBlock =
  | { id: string; kind: "user"; text: string; createdAt: number }
  | { id: string; kind: "assistant"; text: string; createdAt: number }
  | { id: string; kind: "reasoning"; text: string; createdAt: number }
  | { id: string; kind: "tool"; tool: ToolCard }
  | { id: string; kind: "todo"; items: TodoItem[] };

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  worktreePath?: string | null;
  blocks: ChatBlock[];
  diffs: PendingDiff[];
  todos: TodoItem[];
  activities: Activity[];
};

export type ThemePreference = "system" | "light" | "dark";

export type SshAuthMethod = "password" | "key" | "agent";

export type SshProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuthMethod;
  keyPath?: string;
  hasSecret: boolean;
  lastConnectedAt?: number;
};

export type SshConnectionState = {
  profileId: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
};

export type SshProfileInput = {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuthMethod;
  keyPath?: string;
  secret?: string;
  clearSecret?: boolean;
};

export type DbEngine = "sqlite" | "postgres" | "mysql";

export type DbProfile = {
  id: string;
  name: string;
  engine: DbEngine;
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  filePath?: string;
  ssl?: boolean;
  hasSecret: boolean;
  lastConnectedAt?: number;
};

export type DbConnectionState = {
  profileId: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
  currentDatabase?: string;
};

export type DbCatalogInfo = {
  name: string;
  current?: boolean;
};

export type DbProfileInput = {
  id?: string;
  name: string;
  engine: DbEngine;
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  filePath?: string;
  ssl?: boolean;
  secret?: string;
  clearSecret?: boolean;
};

export type DbTableInfo = {
  schema?: string;
  name: string;
  type: "table" | "view";
};

export type DbColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  key?: string;
};

export type DbQueryResult = {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

export type DbRowValue = string | number | boolean | null;

export type DbEditOp =
  | {
      kind: "update";
      table: string;
      schema?: string;
      where: Record<string, DbRowValue>;
      values: Record<string, DbRowValue>;
    }
  | {
      kind: "insert";
      table: string;
      schema?: string;
      values: Record<string, DbRowValue>;
    }
  | {
      kind: "delete";
      table: string;
      schema?: string;
      where: Record<string, DbRowValue>;
    };

export type AppSettings = {
  model: string;
  approvalMode: "ask" | "allowlist";
  theme: ThemePreference;
};

export type AuthMethod = "oauth" | "api-key";

export type AuthStatus = {
  signedIn: boolean;
  method: AuthMethod | null;
  name: string | null;
  email: string | null;
  expiresAt: string | null;
  cliPresent: boolean;
};

export const EMPTY_AUTH: AuthStatus = {
  signedIn: false,
  method: null,
  name: null,
  email: null,
  expiresAt: null,
  cliPresent: false,
};

export type OpenFile = {
  path: string;
  contents: string;
  language: string;
  dirty?: boolean;
};

export type TerminalSessionInfo = {
  id: string;
  title: string;
  cwd: string;
};

export type BrowserTabInfo = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
};

export type InspectedElement = {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  selector: string;
  box: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  accessibility: { role: string | null; name: string | null; label: string | null };
};

export type ConsoleEntry = {
  level: string;
  text: string;
  timestamp: number;
};

export type NetworkEntry = {
  id: string;
  method: string;
  url: string;
  status?: number;
  failed?: boolean;
  timestamp: number;
};

export type GitSnapshot = {
  branch: string;
  ahead: number;
  behind: number;
  status: string;
  changed: string[];
};

export type PermissionRequest = {
  requestId: string;
  threadId: string;
  tool: string;
  summary: string;
  detail?: string;
};

export type AppState = {
  version: string;
  projects: Project[];
  threads: Thread[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  settings: AppSettings;
  hasApiKey: boolean;
  auth: AuthStatus;
  detectedUrls: string[];
  browser: BrowserSessionState;
  browserAttached: boolean;
  sshProfiles: SshProfile[];
  sshConnections: SshConnectionState[];
  dbProfiles: DbProfile[];
  dbConnections: DbConnectionState[];
};

export type AgentStreamEvent =
  | { type: "state"; state: AppState }
  | { type: "text-delta"; threadId: string; blockId: string; text: string }
  | { type: "reasoning"; threadId: string; blockId: string; text: string }
  | { type: "tool-start"; threadId: string; tool: ToolCard }
  | { type: "tool-update"; threadId: string; tool: ToolCard }
  | { type: "activity"; threadId: string; activity: Activity }
  | { type: "diff"; threadId: string; diff: PendingDiff }
  | { type: "todo"; threadId: string; items: TodoItem[] }
  | { type: "approval"; request: PermissionRequest }
  | { type: "dev-server"; url: string }
  | { type: "browser-focus"; url: string }
  | { type: "open-file"; path: string }
  | { type: "ssh-term"; id: string; title: string }
  | { type: "inspect"; element: InspectedElement }
  | { type: "error"; threadId: string; message: string }
  | { type: "done"; threadId: string };

export const DEFAULT_SETTINGS: AppSettings = {
  model: "grok-4.6",
  approvalMode: "allowlist",
  theme: "system",
};

export const LOCALHOST_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}\b/gi;

export function detectLocalUrls(text: string): string[] {
  return [...new Set((text.match(LOCALHOST_URL_RE) ?? []).map((u) => u.replace("0.0.0.0", "localhost").replace("[::1]", "localhost")))];
}

export function normalizeBrowserUrl(input: string): string {
  const raw = input.trim();
  if (!raw || raw === "about:blank") return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `http://${raw}`;
}

export function isRecordableBrowserUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value === "about:blank") return false;
  if (value.startsWith("devtools:") || value.startsWith("chrome:") || value.startsWith("chrome-extension:")) {
    return false;
  }
  return /^https?:\/\//i.test(value);
}

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    md: "markdown",
    html: "html",
    py: "python",
    rs: "rust",
    go: "go",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    sh: "shell",
    toml: "ini",
  };
  return map[ext] ?? "plaintext";
}
