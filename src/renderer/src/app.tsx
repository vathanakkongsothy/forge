import { lazy, Suspense, useEffect, useState } from "react";
import { FolderOpen, Hammer } from "lucide-react";
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  EMPTY_AUTH,
  EMPTY_BROWSER,
  MODELS,
  type AgentStreamEvent,
  type AppState,
  type PermissionRequest,
} from "@forge/shared";
import { Button } from "@/components/ui/button";

const Workspace = lazy(() => import("@/components/workspace").then((m) => ({ default: m.Workspace })));

const empty: AppState = {
  version: APP_VERSION,
  projects: [],
  threads: [],
  activeProjectId: null,
  activeThreadId: null,
  settings: DEFAULT_SETTINGS,
  hasApiKey: false,
  auth: EMPTY_AUTH,
  detectedUrls: [],
  browser: EMPTY_BROWSER,
};

export function App() {
  const [state, setState] = useState<AppState>(empty);
  const [settings, setSettings] = useState(false);
  const [approval, setApproval] = useState<PermissionRequest | null>(null);
  const [offerUrl, setOfferUrl] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Forge ${state.version || APP_VERSION}`;
  }, [state.version]);

  useEffect(() => {
    if (!window.forge) {
      console.error("Forge preload bridge is missing");
      return;
    }
    void window.forge.getState().then(setState);
    return window.forge.onEvent((event: AgentStreamEvent) => {
      if (event.type === "state") setState(event.state);
      if (event.type === "approval") setApproval(event.request);
      if (event.type === "dev-server") setOfferUrl(event.url);
      if (
        event.type === "text-delta" ||
        event.type === "reasoning" ||
        event.type === "tool-start" ||
        event.type === "tool-update" ||
        event.type === "activity"
      ) {
        setState((prev) => applyLive(prev, event));
      }
    });
  }, []);

  const project = state.projects.find((p) => p.id === state.activeProjectId);

  return (
    <div className="relative h-full">
      {project ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-accent">Opening workspace…</div>
          }
        >
          <Workspace state={state} onSettings={() => setSettings(true)} pendingUrl={openUrl} />
        </Suspense>
      ) : (
        <Welcome state={state} onOpen={() => void window.forge.pickFolder()} onSettings={() => setSettings(true)} />
      )}
      {settings ? <SettingsModal state={state} onClose={() => setSettings(false)} /> : null}
      {approval ? (
        <Modal>
          <div className="text-sm font-medium">Permission required</div>
          <p className="mt-2 text-sm text-muted">{approval.summary}</p>
          {approval.detail ? <pre className="mt-2 max-h-40 overflow-auto rounded bg-secondary p-2 text-[11px]">{approval.detail}</pre> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void window.forge.respondApproval(approval.requestId, false);
                setApproval(null);
              }}
            >
              Deny
            </Button>
            <Button
              onClick={() => {
                void window.forge.respondApproval(approval.requestId, true);
                setApproval(null);
              }}
            >
              Allow
            </Button>
          </div>
        </Modal>
      ) : null}
      {offerUrl ? (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 shadow-xl">
          <div className="text-xs">Detected {offerUrl}</div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOfferUrl(null)}>
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setOpenUrl(offerUrl);
                setOfferUrl(null);
              }}
            >
              Open in browser
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Welcome({
  state,
  onOpen,
  onSettings,
}: {
  state: AppState;
  onOpen: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-[540px] rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Hammer className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-semibold">Forge</div>
              <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px] text-muted">
                v{state.version || APP_VERSION}
              </span>
            </div>
            <div className="text-sm text-muted">Ask → Code → Run → See → Inspect → Fix → Verify</div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          A Codex-like coding workspace. The agent can read and edit this machine&apos;s project, run a terminal, open
          localhost, inspect the DOM, and verify the result in an embedded browser.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onOpen}>
            <FolderOpen className="h-4 w-4" />
            Open a folder
          </Button>
          <Button variant="outline" onClick={onSettings}>
            Settings
          </Button>
        </div>
        <AuthSummary auth={state.auth} />
        {state.projects.length ? (
          <div className="mt-6 space-y-1">
            {state.projects.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-secondary"
                onClick={() => void window.forge.openProject(p.path)}
              >
                {p.name} <span className="text-xs text-muted">{p.path}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = state.auth ?? EMPTY_AUTH;
  return (
    <Modal>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Settings</div>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <label className="mt-4 block text-[11px] uppercase tracking-wide text-muted">Grok account</label>
      <p className="text-xs text-muted">
        Sign in with Grok Build CLI OAuth (SuperGrok or X Premium+). Forge shares{" "}
        <code className="text-[11px]">~/.grok/auth.json</code> with the official CLI.
      </p>
      {auth.method === "oauth" ? (
        <div className="mt-2 rounded-md border border-border bg-secondary px-2 py-2 text-xs">
          Signed in{auth.name ? ` as ${auth.name}` : ""} {auth.email ? `· ${auth.email}` : ""}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Not signed in with Grok.</p>
      )}
      <div className="mt-2 flex gap-2">
        {auth.method === "oauth" ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError(null);
              void window.forge.oauthLogout();
            }}
          >
            Sign out
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.forge
                .oauthLogin()
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Waiting for browser…" : "Sign in with Grok"}
          </Button>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <label className="mt-4 block text-[11px] uppercase tracking-wide text-muted">XAI API key</label>
      <p className="text-xs text-muted">
        Optional fallback from console.x.ai. OAuth is used first when you are signed in.
        {auth.method === "api-key" ? " A key is stored." : ""}
      </p>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
      />
      <Button className="mt-2" disabled={!key.trim()} onClick={() => void window.forge.setApiKey(key).then(() => setKey(""))}>
        Save key
      </Button>
      <label className="mt-4 block text-[11px] uppercase tracking-wide text-muted">Model</label>
      <select
        value={state.settings.model}
        onChange={(e) => void window.forge.setSettings({ model: e.target.value })}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-[11px] uppercase tracking-wide text-muted">Approvals</label>
      <select
        value={state.settings.approvalMode}
        onChange={(e) => void window.forge.setSettings({ approvalMode: e.target.value as "ask" | "allowlist" })}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
      >
        <option value="allowlist">Allowlist safe commands</option>
        <option value="ask">Ask before every mutating action</option>
      </select>
      <div className="mt-5 border-t border-border pt-3 text-xs text-muted">
        Forge v{state.version || APP_VERSION}
      </div>
    </Modal>
  );
}

function AuthSummary({ auth }: { auth: AppState["auth"] }) {
  const current = auth ?? EMPTY_AUTH;
  if (current.method === "oauth") {
    return (
      <p className="mt-4 text-xs text-muted">
        Signed in with Grok{current.name ? ` as ${current.name}` : ""}.
      </p>
    );
  }
  if (current.method === "api-key") {
    return <p className="mt-4 text-xs text-muted">Using a stored XAI API key.</p>;
  }
  return <p className="mt-4 text-xs text-muted">Sign in with Grok in Settings to start the agent.</p>;
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
      <div className="w-[460px] rounded-2xl border border-border bg-card p-5">{children}</div>
    </div>
  );
}

function applyLive(state: AppState, event: AgentStreamEvent): AppState {
  if (event.type === "state") return event.state;
  if (!("threadId" in event)) return state;
  return {
    ...state,
    threads: state.threads.map((thread) => {
      if (thread.id !== event.threadId) return thread;
      if (event.type === "text-delta") {
        const exists = thread.blocks.some((b) => b.id === event.blockId);
        const blocks = exists
          ? thread.blocks.map((b) =>
              b.id === event.blockId && b.kind === "assistant" ? { ...b, text: b.text + event.text } : b,
            )
          : [...thread.blocks, { id: event.blockId, kind: "assistant" as const, text: event.text, createdAt: Date.now() }];
        return { ...thread, blocks };
      }
      if (event.type === "reasoning") {
        const exists = thread.blocks.some((b) => b.id === event.blockId);
        const blocks = exists
          ? thread.blocks.map((b) =>
              b.id === event.blockId && b.kind === "reasoning" ? { ...b, text: b.text + event.text } : b,
            )
          : [...thread.blocks, { id: event.blockId, kind: "reasoning" as const, text: event.text, createdAt: Date.now() }];
        return { ...thread, blocks };
      }
      if (event.type === "tool-start") {
        if (thread.blocks.some((b) => b.id === event.tool.id)) return thread;
        return { ...thread, blocks: [...thread.blocks, { id: event.tool.id, kind: "tool", tool: event.tool }] };
      }
      if (event.type === "tool-update") {
        return {
          ...thread,
          blocks: thread.blocks.map((b) => (b.id === event.tool.id && b.kind === "tool" ? { ...b, tool: event.tool } : b)),
        };
      }
      if (event.type === "activity") {
        return { ...thread, activities: [event.activity, ...thread.activities.filter((a) => a.id !== event.activity.id)] };
      }
      return thread;
    }),
  };
}
