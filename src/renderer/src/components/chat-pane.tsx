import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bug,
  Check,
  Circle,
  FileSearch,
  FileText,
  FolderTree,
  Globe,
  Hammer,
  ListTodo,
  Loader2,
  Play,
  Square,
  Terminal,
} from "lucide-react";
import { MODELS, type ChatBlock, type Thread, type TodoItem, type ToolCard } from "@forge/shared";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROMPTS = [
  { icon: FolderTree, text: "Explore this repo and summarize the stack." },
  { icon: Play, text: "Start the dev server and open the preview." },
  { icon: Bug, text: "Find the bug, fix it, and verify in the browser." },
];

export function ChatPane({
  thread,
  hasApiKey,
  model,
}: {
  thread: Thread;
  hasApiKey: boolean;
  model: string;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const running = thread.status === "running";
  const modelLabel = MODELS.find((item) => item.id === model)?.label ?? model;
  const status = statusMeta(thread.status);
  const turns = groupTurns(thread.blocks);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 80;
    if (nearBottom || thread.status === "running") {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [thread.blocks.length, thread.status, thread.updatedAt]);

  function send() {
    const text = draft.trim();
    if (!text || running || !hasApiKey) return;
    setDraft("");
    void window.forge.sendMessage(thread.id, text);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", status.dot)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-5">{thread.title}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{status.label}</div>
        </div>
        <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent sm:inline">
          {modelLabel}
        </span>
        {running ? (
          <Button size="sm" variant="danger" onClick={() => void window.forge.stop(thread.id)}>
            <Square className="h-3 w-3" />
            Stop
          </Button>
        ) : null}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {thread.blocks.length === 0 ? (
          <EmptyState onPick={setDraft} />
        ) : (
          <div className="space-y-4">
            {turns.map((turn, index) =>
              turn.type === "user" ? (
                <UserBubble key={turn.block.id} text={turn.block.kind === "user" ? turn.block.text : ""} />
              ) : (
                <AgentTurn
                  key={turn.blocks[0]?.id ?? index}
                  blocks={turn.blocks}
                  streaming={running && index === turns.length - 1}
                  model={modelLabel}
                />
              ),
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!hasApiKey ? (
        <div className="mx-3 mb-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] leading-4 text-accent">
          Sign in with Grok in Settings to start the agent. An API key still works as a fallback.
        </div>
      ) : null}

      <div className="border-t border-border bg-card/80 p-2.5">
        <div className="rounded-xl border border-border bg-secondary focus-within:border-accent/50">
          <textarea
            value={draft}
            rows={Math.min(6, Math.max(2, draft.split("\n").length))}
            placeholder="Ask Forge to explore, edit, run, and verify…"
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 outline-none placeholder:text-muted"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <label className="flex min-w-0 items-center gap-1 text-[11px] text-muted">
              <span className="sr-only">Model</span>
              <select
                value={model}
                disabled={running}
                onChange={(e) => void window.forge.setSettings({ model: e.target.value })}
                className="max-w-[150px] truncate rounded-md border border-border bg-card px-1.5 py-1 text-[11px] text-foreground"
                title={model}
              >
                {MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
                {MODELS.some((item) => item.id === model) ? null : <option value={model}>{model}</option>}
              </select>
              <span className="hidden text-[10px] text-muted/80 sm:inline">Enter to send</span>
            </label>
            <Button
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5"
              disabled={!draft.trim() || running || !hasApiKey}
              onClick={send}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-2 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Hammer className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium">What should Forge do?</div>
      <p className="mt-1 max-w-[240px] text-[12px] leading-5 text-muted">
        Ask, then it will edit files, run the project, and verify in the browser.
      </p>
      <div className="mt-4 w-full space-y-1.5">
        {PROMPTS.map((item) => (
          <button
            key={item.text}
            type="button"
            className="flex w-full items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[12px] leading-4 text-foreground hover:border-accent/40 hover:bg-secondary"
            onClick={() => onPick(item.text)}
          >
            <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type Turn = { type: "user"; block: ChatBlock } | { type: "agent"; blocks: ChatBlock[] };

function groupTurns(blocks: ChatBlock[]): Turn[] {
  const turns: Turn[] = [];
  for (const block of blocks) {
    if (block.kind === "user") {
      turns.push({ type: "user", block });
      continue;
    }
    const last = turns[turns.length - 1];
    if (last?.type === "agent") last.blocks.push(block);
    else turns.push({ type: "agent", blocks: [block] });
  }
  return turns;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-2xl rounded-br-md bg-accent/15 px-3 py-2 text-[13px] leading-5">
        {text}
      </div>
    </div>
  );
}

function AgentTurn({
  blocks,
  streaming,
  model,
}: {
  blocks: ChatBlock[];
  streaming: boolean;
  model: string;
}) {
  const reasoning = blocks.filter((b) => b.kind === "reasoning" && b.text);
  const tools = blocks.filter((b) => b.kind === "tool");
  const todos = blocks.filter((b) => b.kind === "todo");
  const replies = blocks.filter((b) => b.kind === "assistant" && b.text.trim());
  const busy = streaming && tools.some((b) => b.kind === "tool" && b.tool.status === "running");

  return (
    <div className="agent-turn">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Hammer className="h-3.5 w-3.5" />
      </div>
      <div className="agent-turn-body space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          Forge
          <span className="normal-case tracking-normal text-muted/70">{model}</span>
        </div>
        {reasoning.map((block) =>
          block.kind === "reasoning" ? (
            <details key={block.id} className="rounded-lg bg-secondary/70 px-2.5 py-1.5" open={streaming && !replies.length}>
              <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                Thinking
              </summary>
              <div className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap border-t border-border/60 pt-1.5 text-[11px] leading-5 text-muted">
                {block.text}
              </div>
            </details>
          ) : null,
        )}
        {tools.length ? (
          <div className="overflow-hidden rounded-lg border border-border/80 bg-card">
            {tools.map((block) => (block.kind === "tool" ? <ToolRow key={block.id} tool={block.tool} /> : null))}
          </div>
        ) : null}
        {todos.map((block) => (block.kind === "todo" ? <TodoCard key={block.id} items={block.items} /> : null))}
        {replies.map((block) =>
          block.kind === "assistant" ? (
            <div key={block.id} className="agent-response">
              <MarkdownView markdown={block.text} />
            </div>
          ) : null,
        )}
        {streaming && !replies.length ? (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
            </span>
            {busy ? "Using tools" : "Writing"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TodoCard({ items }: { items: TodoItem[] }) {
  const done = items.filter((item) => item.status === "completed").length;
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
        <ListTodo className="h-3.5 w-3.5 text-accent" />
        Plan
        <span className="ml-auto tabular-nums">
          {done}/{items.length}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-[12px] leading-4">
            {item.status === "completed" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : item.status === "in_progress" ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
            )}
            <span className={cn(item.status === "completed" && "text-muted line-through")}>{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolCard }) {
  const Icon = toolIcon(tool.name);
  const open = tool.status === "running" || tool.status === "error" || tool.status === "waiting_approval";
  const arg = toolArg(tool.args);
  return (
    <details open={open} className="border-b border-border/70 last:border-b-0">
      <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px]">
        {tool.status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        ) : tool.status === "error" ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
        ) : tool.status === "done" ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
        )}
        <span className="shrink-0 font-mono text-[11px] text-accent">{friendlyTool(tool.name)}</span>
        {arg ? <span className="min-w-0 truncate text-[11px] text-muted">{arg}</span> : null}
      </summary>
      {tool.output ? (
        <pre className="max-h-32 overflow-auto border-t border-border/70 bg-background/40 px-2.5 py-2 font-mono text-[11px] leading-4 text-muted">
          {tool.output}
        </pre>
      ) : null}
    </details>
  );
}

function friendlyTool(name: string): string {
  return name.replaceAll("_", " ");
}

function toolIcon(name: string) {
  if (name.includes("browser")) return Globe;
  if (name.includes("command") || name.includes("term")) return Terminal;
  if (name.includes("search")) return FileSearch;
  if (name.includes("list") || name.includes("dir")) return FolderTree;
  return FileText;
}

function toolArg(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const value = record.path ?? record.command ?? record.query ?? record.url;
  return typeof value === "string" ? value : "";
}

function statusMeta(status: Thread["status"]) {
  if (status === "running") return { label: "Working", dot: "bg-accent animate-pulse" };
  if (status === "needs_review") return { label: "Needs review", dot: "bg-sky-400" };
  if (status === "error") return { label: "Error", dot: "bg-red-400" };
  return { label: "Ready", dot: "bg-muted" };
}
