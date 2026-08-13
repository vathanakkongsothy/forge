import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function TerminalPane({ cwd }: { cwd?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [id, setId] = useState("term-1");
  const [tabs, setTabs] = useState(["term-1"]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.forge) return;
    let disposed = false;
    let cleanup = () => undefined as void;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !hostRef.current) return;
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: "Cascadia Code, Consolas, monospace",
        theme: { background: "#0c0d10", foreground: "#eceef1", cursor: "#e0b044" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      void window.forge.termCreate(id, cwd);
      const off = window.forge.onTermData((payload) => {
        if (payload.id === id) term.write(payload.chunk);
      });
      const disposable = term.onData((data) => {
        void window.forge.termWrite(id, data);
      });
      const onResize = () => {
        fit.fit();
        void window.forge.termResize(id, term.cols, term.rows);
      };
      window.addEventListener("resize", onResize);
      onResize();
      cleanup = () => {
        off();
        disposable.dispose();
        window.removeEventListener("resize", onResize);
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [id, cwd]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-2 py-1 text-[11px] ${tab === id ? "text-accent" : "text-muted"}`}
            onClick={() => setId(tab)}
          >
            {tab}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = `term-${tabs.length + 1}`;
            setTabs((t) => [...t, next]);
            setId(next);
          }}
        >
          +
        </Button>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
