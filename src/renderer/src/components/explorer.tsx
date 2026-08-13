import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { FileEntry } from "@forge/shared";
import { cn } from "@/lib/utils";

function Node({
  entry,
  depth,
  onOpen,
}: {
  entry: FileEntry;
  depth: number;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<FileEntry[] | null>(null);

  useEffect(() => {
    if (open && entry.type === "dir" && !kids) {
      void window.forge.listDir(entry.path).then(setKids);
    }
  }, [open, entry.path, entry.type, kids]);

  if (entry.type === "dir") {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs hover:bg-secondary"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight className={cn("h-3 w-3 text-muted transition", open && "rotate-90")} />
          {open ? <FolderOpen className="h-3.5 w-3.5 text-accent" /> : <Folder className="h-3.5 w-3.5 text-accent" />}
          <span className="truncate">{entry.name}</span>
        </button>
        {open
          ? kids?.map((child) => <Node key={child.path} entry={child} depth={depth + 1} onOpen={onOpen} />)
          : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs hover:bg-secondary"
      style={{ paddingLeft: 20 + depth * 12 }}
      onClick={() => onOpen(entry.path)}
    >
      <File className="h-3.5 w-3.5 text-muted" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function Explorer({ onOpen }: { onOpen: (path: string) => void }) {
  const [roots, setRoots] = useState<FileEntry[]>([]);

  useEffect(() => {
    void window.forge.listDir(".").then(setRoots);
  }, []);

  return (
    <div className="h-full overflow-auto py-1">
      {roots.map((entry) => (
        <Node key={entry.path} entry={entry} depth={0} onOpen={onOpen} />
      ))}
    </div>
  );
}
