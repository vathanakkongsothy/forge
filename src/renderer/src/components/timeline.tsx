import type { Activity } from "@forge/shared";
import { cn } from "@/lib/utils";

export function Timeline({ items }: { items: Activity[] }) {
  if (!items.length) {
    return <div className="p-3 text-xs text-muted">Agent activity appears here as work happens.</div>;
  }
  return (
    <div className="space-y-1 overflow-auto p-2">
      {items.map((item) => (
        <details key={item.id} className="rounded-md border border-border px-2 py-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                item.status === "running" && "bg-accent",
                item.status === "done" && "bg-emerald-400",
                item.status === "error" && "bg-red-400",
                item.status === "waiting" && "bg-sky-400",
              )}
            />
            {item.title}
          </summary>
          {item.detail ? <pre className="mt-1 text-[11px] text-muted">{item.detail}</pre> : null}
        </details>
      ))}
    </div>
  );
}
