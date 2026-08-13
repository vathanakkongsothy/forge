import { useEffect, useState } from "react";
import type { GitSnapshot } from "@forge/shared";
import { Button } from "@/components/ui/button";

export function GitPane() {
  const [snap, setSnap] = useState<GitSnapshot | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    setSnap(await window.forge.gitSnapshot());
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-auto p-2 text-xs">
      <div className="mb-2 font-medium">
        {snap?.branch ?? "not a git repo"}
        {snap ? ` · ${snap.changed.length} changed` : ""}
      </div>
      <div className="space-y-1">
        {snap?.changed.map((file) => (
          <div key={file} className="flex items-center justify-between gap-2">
            <span className="truncate font-mono">{file}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void window.forge.gitStage(file).then(refresh)}>
                stage
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void window.forge.gitUnstage(file).then(refresh)}>
                unstage
              </Button>
            </div>
          </div>
        ))}
      </div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Commit message"
        className="mt-3 h-7 rounded-md border border-border bg-secondary px-2"
      />
      <Button
        className="mt-2"
        disabled={!message.trim()}
        onClick={() => {
          void window.forge.gitCommit(message).then(() => {
            setMessage("");
            void refresh();
          });
        }}
      >
        Commit
      </Button>
    </div>
  );
}
