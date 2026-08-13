import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Hammer, Plus, Settings } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { APP_VERSION, EMPTY_BROWSER, type AppState, type OpenFile } from "@forge/shared";
import { BrowserPane } from "@/components/browser-pane";
import { ChatPane } from "@/components/chat-pane";
import { EditorPane } from "@/components/editor-pane";
import { Explorer } from "@/components/explorer";
import { GitPane } from "@/components/git-pane";
import { TerminalPane } from "@/components/terminal-pane";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Workspace({
  state,
  onSettings,
  pendingUrl,
}: {
  state: AppState;
  onSettings: () => void;
  pendingUrl?: string | null;
}) {
  const project = state.projects.find((p) => p.id === state.activeProjectId);
  const threads = useMemo(
    () => state.threads.filter((t) => t.projectId === state.activeProjectId),
    [state.threads, state.activeProjectId],
  );
  const thread = threads.find((t) => t.id === state.activeThreadId) ?? threads[0];
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [center, setCenter] = useState<"editor" | "diff" | "browser">("editor");
  const [left, setLeft] = useState<"files" | "git">("files");
  const [right, setRight] = useState<"chat" | "activity">("chat");
  const browser = state.browser ?? EMPTY_BROWSER;
  const [browserUrl, setBrowserUrl] = useState(browser.lastUrl || "about:blank");
  const [inspect, setInspect] = useState(false);

  useEffect(() => {
    if (browser.lastUrl) setBrowserUrl(browser.lastUrl);
  }, [browser.lastUrl]);

  useEffect(() => {
    if (pendingUrl) {
      setBrowserUrl(pendingUrl);
      setCenter("browser");
      void window.forge.browserRecord(pendingUrl);
    }
  }, [pendingUrl]);

  async function openFile(path: string) {
    const file = await window.forge.readFile(path);
    setFiles((prev) => {
      const rest = prev.filter((f) => f.path !== path);
      return [...rest, file];
    });
    setActivePath(path);
    setCenter("editor");
  }

  if (!project || !thread) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Open a folder to begin.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Hammer className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">Forge</span>
        <span className="rounded border border-border px-1 py-px text-[10px] text-muted">
          v{state.version || APP_VERSION}
        </span>
        <span className="text-xs text-muted">{project.name}</span>
        {state.auth?.method === "oauth" && state.auth.name ? (
          <span className="text-[11px] text-muted">{state.auth.name}</span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void window.forge.pickFolder()}>
          <FolderOpen className="h-3.5 w-3.5" />
          Folder
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {(["editor", "diff", "browser"] as const).map((tab) => (
            <Button key={tab} size="sm" variant={center === tab ? "default" : "ghost"} onClick={() => setCenter(tab)}>
              {tab}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={onSettings}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={18} minSize={12}>
            <div className="flex h-full flex-col border-r border-border">
              <div className="flex border-b border-border">
                <Tab active={left === "files"} onClick={() => setLeft("files")}>
                  Files
                </Tab>
                <Tab active={left === "git"} onClick={() => setLeft("git")}>
                  Git
                </Tab>
              </div>
              <div className="min-h-0 flex-1">
                {left === "files" ? <Explorer onOpen={(p) => void openFile(p)} /> : <GitPane />}
              </div>
              <div className="border-t border-border">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
                  Threads
                  <button type="button" onClick={() => void window.forge.createThread()}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {threads.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1 text-left text-xs",
                      item.id === thread.id ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                    onClick={() => void window.forge.selectThread(item.id)}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        item.status === "running" && "bg-accent",
                        item.status === "needs_review" && "bg-sky-400",
                        item.status === "error" && "bg-red-400",
                        item.status === "idle" && "bg-muted",
                      )}
                    />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border" />
          <Panel minSize={30}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={70} minSize={30}>
                {center === "browser" ? (
                  <BrowserPane
                    url={browserUrl}
                    onUrl={setBrowserUrl}
                    inspect={inspect}
                    onInspect={setInspect}
                    session={browser}
                  />
                ) : (
                  <EditorPane
                    files={files}
                    activePath={activePath}
                    onSelect={setActivePath}
                    onChange={(path, value) =>
                      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, contents: value, dirty: true } : f)))
                    }
                    onClose={(path) => setFiles((prev) => prev.filter((f) => f.path !== path))}
                    onSave={(path) => {
                      const file = files.find((f) => f.path === path);
                      if (!file) return;
                      void window.forge.writeUserFile(path, file.contents);
                      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, dirty: false } : f)));
                    }}
                    diffs={thread.diffs}
                    threadId={thread.id}
                    showDiff={center === "diff"}
                  />
                )}
              </Panel>
              <PanelResizeHandle className="h-1 bg-border" />
              <Panel defaultSize={30} minSize={16}>
                <TerminalPane cwd={project.path} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border" />
          <Panel defaultSize={26} minSize={18}>
            <div className="flex h-full flex-col border-l border-border bg-card/30">
              <div className="flex items-center gap-1 border-b border-border px-1">
                <Tab active={right === "chat"} onClick={() => setRight("chat")}>
                  Agent
                </Tab>
                <Tab active={right === "activity"} onClick={() => setRight("activity")}>
                  Activity
                  {thread.activities.length ? (
                    <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted">{thread.activities.length}</span>
                  ) : null}
                </Tab>
              </div>
              <div className="min-h-0 flex-1">
                {right === "chat" ? (
                  <ChatPane thread={thread} hasApiKey={state.hasApiKey} model={state.settings.model} />
                ) : (
                  <Timeline items={thread.activities} />
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
