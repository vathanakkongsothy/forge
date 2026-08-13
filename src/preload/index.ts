import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentStreamEvent,
  AppSettings,
  AppState,
  DbCatalogInfo,
  DbColumnInfo,
  DbEditOp,
  DbProfileInput,
  DbQueryResult,
  DbTableInfo,
  FileEntry,
  GitSnapshot,
  OpenFile,
  SshProfileInput,
} from "@forge/shared";

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("forge:getState"),
  pickFolder: (): Promise<AppState | null> => ipcRenderer.invoke("forge:pickFolder"),
  openProject: (path: string): Promise<AppState> => ipcRenderer.invoke("forge:openProject", path),
  createThread: (): Promise<AppState> => ipcRenderer.invoke("forge:createThread"),
  selectThread: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:selectThread", id),
  listDir: (path: string): Promise<FileEntry[]> => ipcRenderer.invoke("forge:listDir", path),
  readFile: (path: string): Promise<OpenFile> => ipcRenderer.invoke("forge:readFile", path),
  writeUserFile: (path: string, contents: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("forge:writeUserFile", { path, contents }),
  createPath: (path: string, type: "file" | "dir"): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("forge:createPath", { path, type }),
  deletePath: (path: string): Promise<{ ok: boolean }> => ipcRenderer.invoke("forge:deletePath", path),
  renamePath: (from: string, to: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("forge:renamePath", { from, to }),
  gitSnapshot: (): Promise<GitSnapshot | null> => ipcRenderer.invoke("forge:gitSnapshot"),
  gitStage: (path: string): Promise<string> => ipcRenderer.invoke("forge:gitStage", path),
  gitUnstage: (path: string): Promise<string> => ipcRenderer.invoke("forge:gitUnstage", path),
  gitCommit: (message: string): Promise<string> => ipcRenderer.invoke("forge:gitCommit", message),
  acceptDiff: (threadId: string, diffId: string): Promise<AppState> =>
    ipcRenderer.invoke("forge:acceptDiff", { threadId, diffId }),
  rejectDiff: (threadId: string, diffId: string): Promise<AppState> =>
    ipcRenderer.invoke("forge:rejectDiff", { threadId, diffId }),
  setApiKey: (key: string): Promise<AppState> => ipcRenderer.invoke("forge:setApiKey", key),
  oauthLogin: (): Promise<AppState> => ipcRenderer.invoke("forge:oauthLogin"),
  oauthLogout: (): Promise<AppState> => ipcRenderer.invoke("forge:oauthLogout"),
  setSettings: (partial: Partial<AppSettings>): Promise<AppState> => ipcRenderer.invoke("forge:setSettings", partial),
  sendMessage: (threadId: string, text: string): Promise<AppState> =>
    ipcRenderer.invoke("forge:sendMessage", { threadId, text }),
  stop: (threadId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke("forge:stop", threadId),
  respondApproval: (requestId: string, allow: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("forge:respondApproval", { requestId, allow }),
  termCreate: (id: string, cwd?: string) => ipcRenderer.invoke("forge:termCreate", { id, cwd }),
  termWrite: (id: string, data: string) => ipcRenderer.invoke("forge:termWrite", { id, data }),
  termResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("forge:termResize", { id, cols, rows }),
  termKill: (id: string) => ipcRenderer.invoke("forge:termKill", id),
  browserAttach: (wcId: number) => ipcRenderer.invoke("forge:browserAttach", wcId),
  browserInspect: (enabled: boolean) => ipcRenderer.invoke("forge:browserInspect", enabled),
  browserNavigate: (url: string): Promise<AppState> => ipcRenderer.invoke("forge:browserNavigate", url),
  browserRecord: (url: string, title?: string): Promise<AppState> =>
    ipcRenderer.invoke("forge:browserRecord", { url, title }),
  browserBack: (): Promise<AppState> => ipcRenderer.invoke("forge:browserBack"),
  browserForward: (): Promise<AppState> => ipcRenderer.invoke("forge:browserForward"),
  browserClearHistory: (): Promise<AppState> => ipcRenderer.invoke("forge:browserClearHistory"),
  openLink: (href: string): Promise<{ ok: boolean; action: string }> => ipcRenderer.invoke("forge:openLink", href),
  sshSave: (input: SshProfileInput): Promise<AppState> => ipcRenderer.invoke("forge:sshSave", input),
  sshDelete: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:sshDelete", id),
  sshConnect: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:sshConnect", id),
  sshDisconnect: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:sshDisconnect", id),
  sshPickKey: (): Promise<string | null> => ipcRenderer.invoke("forge:sshPickKey"),
  dbSave: (input: DbProfileInput): Promise<AppState> => ipcRenderer.invoke("forge:dbSave", input),
  dbDelete: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:dbDelete", id),
  dbConnect: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:dbConnect", id),
  dbDisconnect: (id: string): Promise<AppState> => ipcRenderer.invoke("forge:dbDisconnect", id),
  dbDatabases: (id: string): Promise<DbCatalogInfo[]> => ipcRenderer.invoke("forge:dbDatabases", id),
  dbOpen: (id: string, database: string): Promise<AppState> => ipcRenderer.invoke("forge:dbOpen", { id, database }),
  dbTables: (id: string): Promise<DbTableInfo[]> => ipcRenderer.invoke("forge:dbTables", id),
  dbColumns: (id: string, table: string, schema?: string): Promise<DbColumnInfo[]> =>
    ipcRenderer.invoke("forge:dbColumns", { id, table, schema }),
  dbQuery: (id: string, sql: string, confirm?: boolean): Promise<DbQueryResult> =>
    ipcRenderer.invoke("forge:dbQuery", { id, sql, confirm }),
  dbApplyEdits: (id: string, ops: DbEditOp[]): Promise<{ applied: number }> =>
    ipcRenderer.invoke("forge:dbApplyEdits", { id, ops }),
  dbPickSqlite: (): Promise<string | null> => ipcRenderer.invoke("forge:dbPickSqlite"),
  onEvent: (handler: (event: AgentStreamEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: AgentStreamEvent) => handler(payload);
    ipcRenderer.on("forge:event", listener);
    return () => ipcRenderer.removeListener("forge:event", listener);
  },
  onTermData: (handler: (payload: { id: string; chunk: string }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { id: string; chunk: string }) => handler(payload);
    ipcRenderer.on("forge:term-data", listener);
    return () => ipcRenderer.removeListener("forge:term-data", listener);
  },
};

contextBridge.exposeInMainWorld("forge", api);
export type ForgeApi = typeof api;
