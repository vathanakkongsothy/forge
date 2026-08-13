import { randomUUID } from "node:crypto";
import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { createXai } from "@ai-sdk/xai";
import type { Activity, ChatBlock, PendingDiff } from "@forge/shared";
import { createToolRegistry, type ForgeTool, type ToolContext } from "@forge/tools";
import { systemPrompt } from "./prompt";

export type AgentHooks = {
  onText: (blockId: string, delta: string) => void;
  onReasoning: (blockId: string, delta: string) => void;
  onTool: (id: string, name: string, args: unknown, status: string, output?: string) => void;
  onActivity: (activity: Activity) => void;
  onDiff: (diff: PendingDiff) => void;
  onUrls: (urls: string[]) => void;
};

export type RunAgentInput = {
  apiKey: string;
  model: string;
  workspaceRoot: string;
  threadId: string;
  userText: string;
  history: ChatBlock[];
  inspectedJson?: string;
  browserBrief?: string;
  abortSignal: AbortSignal;
  context: Omit<ToolContext, "onActivity">;
  hooks: AgentHooks;
};

const running = new Map<string, AbortController>();

export function stopAgent(threadId: string): void {
  running.get(threadId)?.abort();
  running.delete(threadId);
}

export function isAgentRunning(threadId?: string): boolean {
  if (threadId) return running.has(threadId);
  return running.size > 0;
}

export async function runAgent(input: RunAgentInput): Promise<void> {
  running.get(input.threadId)?.abort();
  running.set(input.threadId, abortFrom(input.abortSignal));

  const assistantId = randomUUID();
  const xai = createXai({ apiKey: input.apiKey });
  const registry = createToolRegistry();

  const ctx: ToolContext = {
    ...input.context,
    onActivity: (title, detail) => {
      input.hooks.onActivity({
        id: randomUUID(),
        threadId: input.threadId,
        title,
        detail,
        status: "running",
        createdAt: Date.now(),
      });
    },
  };

  const tools = Object.fromEntries(registry.map((def) => [def.name, toSdkTool(def, ctx, input.hooks)]));

  try {
    const result = streamText({
      model: xai.responses(input.model),
      system: systemPrompt(input.workspaceRoot, input.inspectedJson, input.browserBrief),
      messages: toMessages(input.history, input.userText),
      tools,
      stopWhen: stepCountIs(28),
      abortSignal: input.abortSignal,
      maxRetries: 1,
      providerOptions: { xai: { store: false } },
    });

    let reasoningId: string | null = null;
    for await (const part of result.fullStream) {
      if (input.abortSignal.aborted) break;
      if (part.type === "text-delta") {
        const text = "text" in part ? String(part.text) : "";
        if (text) input.hooks.onText(assistantId, text);
      } else if (part.type === "reasoning-delta") {
        const text = "text" in part ? String(part.text) : "";
        if (!text) continue;
        if (!reasoningId) reasoningId = randomUUID();
        input.hooks.onReasoning(reasoningId, text);
      }
    }
  } finally {
    running.delete(input.threadId);
  }
}

function abortFrom(signal: AbortSignal): AbortController {
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}

function toSdkTool(def: ForgeTool, ctx: ToolContext, hooks: AgentHooks) {
  return tool({
    description: def.description,
    inputSchema: def.parameters,
    execute: async (args) => {
      const id = randomUUID();
      hooks.onTool(id, def.name, args, "running");
      try {
        const result = await def.execute(args as Record<string, unknown>, ctx);
        if (result.diff) hooks.onDiff(result.diff);
        if (result.urls?.length) hooks.onUrls(result.urls);
        hooks.onTool(id, def.name, args, "done", result.output.slice(0, 8000));
        return result.image ? `${result.output}\n[screenshot base64 length=${result.image.length}]` : result.output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        hooks.onTool(id, def.name, args, "error", message);
        return `Error: ${message}`;
      }
    },
  });
}

function toMessages(blocks: ChatBlock[], latestUser: string): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const block of blocks) {
    if (block.kind === "user") messages.push({ role: "user", content: block.text });
    if (block.kind === "assistant" && block.text.trim()) messages.push({ role: "assistant", content: block.text });
  }
  if (!messages.length || messages[messages.length - 1]?.role !== "user") {
    messages.push({ role: "user", content: latestUser });
  }
  return messages.slice(-24);
}

export { systemPrompt };
