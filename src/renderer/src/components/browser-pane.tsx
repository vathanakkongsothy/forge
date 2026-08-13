import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock, MousePointer2, RefreshCw, Trash2 } from "lucide-react";
import type { BrowserSessionState } from "@forge/shared";
import { normalizeBrowserUrl } from "@forge/shared";
import { Button } from "@/components/ui/button";

export function BrowserPane({
  url,
  onUrl,
  inspect,
  onInspect,
  session,
}: {
  url: string;
  onUrl: (url: string) => void;
  inspect: boolean;
  onInspect: (v: boolean) => void;
  session: BrowserSessionState;
}) {
  const ref = useRef<Electron.WebviewTag | null>(null);
  const [draft, setDraft] = useState(url);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => setDraft(url), [url]);

  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    const ready = () => {
      try {
        const id = view.getWebContentsId();
        void window.forge.browserAttach(id);
      } catch {
        /* not attached yet */
      }
    };
    const onStart = () => setLoading(true);
    const onStop = () => {
      setLoading(false);
      const current = view.getURL();
      const title = view.getTitle();
      onUrl(current);
      void window.forge.browserRecord(current, title);
    };
    view.addEventListener("dom-ready", ready);
    view.addEventListener("did-start-loading", onStart);
    view.addEventListener("did-stop-loading", onStop);
    return () => {
      view.removeEventListener("dom-ready", ready);
      view.removeEventListener("did-start-loading", onStart);
      view.removeEventListener("did-stop-loading", onStop);
    };
  }, [onUrl, url]);

  useEffect(() => {
    void window.forge.browserInspect(inspect).catch(() => undefined);
  }, [inspect]);

  const canBack = session.index > 0;
  const canForward = session.index >= 0 && session.index < session.stack.length - 1;
  const visits = session.visits.slice(0, 20);

  async function go(next: string) {
    const target = normalizeBrowserUrl(next);
    if (!target || target === "about:blank") return;
    setHistoryOpen(false);
    onUrl(target);
    await window.forge.browserNavigate(target);
    ref.current?.loadURL(target);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <Button
          size="icon"
          variant="ghost"
          disabled={!canBack}
          onClick={async () => {
            const next = await window.forge.browserBack();
            if (next.browser.lastUrl) onUrl(next.browser.lastUrl);
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!canForward}
          onClick={async () => {
            const next = await window.forge.browserForward();
            if (next.browser.lastUrl) onUrl(next.browser.lastUrl);
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => ref.current?.reload()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <div className="relative min-w-0 flex-1">
          <input
            value={draft}
            list="forge-browser-history"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void go(draft);
            }}
            placeholder="http://localhost:3000"
            className="h-7 w-full rounded-md border border-border bg-secondary px-2 font-mono text-xs"
          />
          <datalist id="forge-browser-history">
            {visits.map((visit) => (
              <option key={`${visit.url}-${visit.visitedAt}`} value={visit.url}>
                {visit.title || visit.url}
              </option>
            ))}
          </datalist>
        </div>
        <div className="relative">
          <Button size="sm" variant={historyOpen ? "default" : "secondary"} onClick={() => setHistoryOpen((v) => !v)}>
            <Clock className="h-3.5 w-3.5" />
            History
          </Button>
          {historyOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-border bg-card p-1 shadow-xl">
              {visits.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted">No remembered pages yet.</div>
              ) : (
                visits.map((visit) => (
                  <button
                    key={`${visit.url}-${visit.visitedAt}`}
                    type="button"
                    className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-secondary"
                    onClick={() => void go(visit.url)}
                  >
                    <span className="truncate text-xs">{visit.title || visit.url}</span>
                    <span className="truncate font-mono text-[10px] text-muted">{visit.url}</span>
                  </button>
                ))
              )}
              {visits.length ? (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-[11px] text-muted hover:bg-secondary"
                  onClick={async () => {
                    await window.forge.browserClearHistory();
                    onUrl("about:blank");
                    setHistoryOpen(false);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear history
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button size="sm" variant={inspect ? "default" : "secondary"} onClick={() => onInspect(!inspect)}>
          <MousePointer2 className="h-3.5 w-3.5" />
          Inspect
        </Button>
      </div>
      {url && url !== "about:blank" ? (
        <webview
          ref={(el) => {
            ref.current = el as unknown as Electron.WebviewTag | null;
          }}
          src={url}
          className="min-h-0 flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
          <div>Enter a URL or open a remembered page.</div>
          {visits[0] ? (
            <Button size="sm" variant="secondary" onClick={() => void go(visits[0].url)}>
              Resume {visits[0].url}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
