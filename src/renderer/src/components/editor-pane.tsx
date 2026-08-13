import { lazy, Suspense, useEffect, useState } from "react";
import type { OpenFile, PendingDiff } from "@forge/shared";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { lineDiff } from "@/lib/utils";
import { cn } from "@/lib/utils";

const Monaco = lazy(async () => {
  const reactMonaco = await import("@monaco-editor/react");
  const monaco = await import("monaco-editor");
  reactMonaco.loader.config({ monaco });
  return { default: reactMonaco.default };
});

export function EditorPane(props: {
  files: OpenFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onClose: (path: string) => void;
  onSave: (path: string) => void;
  diffs: PendingDiff[];
  threadId: string | null;
  showDiff: boolean;
}) {
  const active = props.files.find((f) => f.path === props.activePath) ?? props.files[0];
  const selectedDiff = props.diffs[0];
  const markdown = isMarkdownFile(active);
  const [mode, setMode] = useState<"preview" | "source">(markdown ? "preview" : "source");

  useEffect(() => {
    setMode(isMarkdownFile(active) ? "preview" : "source");
  }, [active?.path]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-1 overflow-auto border-b border-border px-1">
        {props.files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => props.onSelect(file.path)}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-xs",
              file.path === active?.path ? "bg-secondary text-foreground" : "text-muted",
            )}
          >
            {file.path.split("/").pop()}
            {file.dirty ? "*" : ""}
            <span
              onClick={(e) => {
                e.stopPropagation();
                props.onClose(file.path);
              }}
            >
              ×
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 p-1">
          {markdown ? (
            <>
              <Button size="sm" variant={mode === "preview" ? "default" : "ghost"} onClick={() => setMode("preview")}>
                Preview
              </Button>
              <Button size="sm" variant={mode === "source" ? "default" : "ghost"} onClick={() => setMode("source")}>
                Edit
              </Button>
            </>
          ) : null}
          {active ? (
            <Button size="sm" variant="secondary" onClick={() => props.onSave(active.path)}>
              Save
            </Button>
          ) : null}
        </div>
      </div>
      {props.showDiff && selectedDiff ? (
        <DiffView threadId={props.threadId} diff={selectedDiff} />
      ) : active && markdown && mode === "preview" ? (
        <div className="forge-md-page min-h-0 flex-1">
          <MarkdownView markdown={active.contents} />
        </div>
      ) : active ? (
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="p-4 text-xs text-muted">Loading editor…</div>}>
            <Monaco
              theme="vs-dark"
              path={active.path}
              language={active.language}
              value={active.contents}
              onChange={(value) => props.onChange(active.path, value ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
            />
          </Suspense>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">Open a file from the explorer.</div>
      )}
    </div>
  );
}

function isMarkdownFile(file?: OpenFile): boolean {
  if (!file) return false;
  if (file.language === "markdown") return true;
  return /\.(md|mdx|markdown)$/i.test(file.path);
}

function DiffView({ threadId, diff }: { threadId: string | null; diff: PendingDiff }) {
  const lines = lineDiff(diff.before, diff.after);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="font-mono">{diff.path}</span>
        <span className="text-muted">{diff.status}</span>
        {threadId && diff.status === "pending" ? (
          <>
            <Button size="sm" variant="success" onClick={() => void window.forge.acceptDiff(threadId, diff.id)}>
              Accept
            </Button>
            <Button size="sm" variant="danger" onClick={() => void window.forge.rejectDiff(threadId, diff.id)}>
              Reject
            </Button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5">
        {lines.map((line, i) => (
          <div
            key={`${i}-${line.type}`}
            className={cn(
              "whitespace-pre-wrap px-3",
              line.type === "add" && "bg-emerald-500/10 text-emerald-200",
              line.type === "del" && "bg-red-500/10 text-red-200",
              line.type === "eq" && "text-muted",
            )}
          >
            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "} {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
