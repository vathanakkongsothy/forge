import { z } from "zod";
import type { BrowserWorkspace } from "@forge/browser";
import { gitCommit, gitDiff, gitLog, gitSnapshot, gitStage, gitStatus, gitUnstage } from "@forge/git";
import type { PendingDiff, PermissionLevel } from "@forge/shared";
import {
  createDirectory,
  createFile,
  deletePath,
  editFile,
  listDirectory,
  readFileText,
  searchCode,
  searchFiles,
  writeFileText,
} from "./fs";
import { commandRisk, isDevServerCommand, toolRisk } from "./permissions";

export type ToolResult = {
  output: string;
  diff?: PendingDiff;
  urls?: string[];
  image?: string;
};

export type ToolContext = {
  workspaceRoot: string;
  approvalMode: "ask" | "allowlist";
  abortSignal?: AbortSignal;
  requestPermission: (level: PermissionLevel, summary: string, detail?: string) => Promise<boolean>;
  runCommand: (command: string) => Promise<{ output: string; urls: string[] }>;
  terminalOutput: (id?: string) => string;
  browser: () => BrowserWorkspace | null;
  ensureBrowser?: (url?: string) => Promise<BrowserWorkspace>;
  onActivity: (title: string, detail?: string) => void;
};

export type ForgeTool = {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: z.ZodType<any>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

async function maybeAsk(ctx: ToolContext, name: string, args: Record<string, unknown>, summary: string): Promise<void> {
  const level = name === "run_command" ? commandRisk(String(args.command ?? "")) : toolRisk(name, args, ctx.approvalMode);
  if (level === "safe") return;
  const ok = await ctx.requestPermission(level, summary, JSON.stringify(args));
  if (!ok) throw new Error("User denied this action.");
}

export function createToolRegistry(): ForgeTool[] {
  return [
    {
      name: "read_file",
      description: "Read a text file from the workspace. Paths are relative to the project root.",
      parameters: z.object({
        path: z.string(),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Reading ${args.path}`);
        return { output: readFileText(ctx.workspaceRoot, String(args.path), args.offset as number | undefined, args.limit as number | undefined) };
      },
    },
    {
      name: "write_file",
      description: "Create or overwrite a text file. Prefer edit_file for existing files.",
      parameters: z.object({ path: z.string(), contents: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "write_file", args, `Write ${args.path}`);
        ctx.onActivity(`Writing ${args.path}`);
        const diff = writeFileText(ctx.workspaceRoot, String(args.path), String(args.contents));
        return { output: `Wrote ${diff.path}`, diff };
      },
    },
    {
      name: "edit_file",
      description: "Replace exact old_string with new_string in a file.",
      parameters: z.object({ path: z.string(), old_string: z.string(), new_string: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "edit_file", args, `Edit ${args.path}`);
        ctx.onActivity(`Editing ${args.path}`);
        const diff = editFile(ctx.workspaceRoot, String(args.path), String(args.old_string), String(args.new_string));
        return { output: `Edited ${diff.path}`, diff };
      },
    },
    {
      name: "create_file",
      description: "Create a new file. Fails if it already exists.",
      parameters: z.object({ path: z.string(), contents: z.string().default("") }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "create_file", args, `Create ${args.path}`);
        ctx.onActivity(`Creating ${args.path}`);
        const diff = createFile(ctx.workspaceRoot, String(args.path), String(args.contents ?? ""));
        return { output: `Created ${diff.path}`, diff };
      },
    },
    {
      name: "delete_file",
      description: "Delete a file or folder inside the workspace.",
      parameters: z.object({ path: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "delete_file", args, `Delete ${args.path}`);
        ctx.onActivity(`Deleting ${args.path}`);
        return { output: deletePath(ctx.workspaceRoot, String(args.path)) };
      },
    },
    {
      name: "list_directory",
      description: "List files and folders in a workspace directory.",
      parameters: z.object({ path: z.string().default(".") }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Listing ${args.path ?? "."}`);
        const entries = listDirectory(ctx.workspaceRoot, String(args.path ?? "."));
        return { output: entries.map((e) => `${e.type.padEnd(4)} ${e.path}`).join("\n") || "(empty)" };
      },
    },
    {
      name: "search_files",
      description: "Find files by name.",
      parameters: z.object({ query: z.string() }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Searching files ${args.query}`);
        return { output: searchFiles(ctx.workspaceRoot, String(args.query)).join("\n") || "No files." };
      },
    },
    {
      name: "search_code",
      description: "Search file contents with a regex or literal pattern.",
      parameters: z.object({ pattern: z.string(), glob: z.string().optional() }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Searching code ${args.pattern}`);
        return { output: searchCode(ctx.workspaceRoot, String(args.pattern), args.glob as string | undefined) };
      },
    },
    {
      name: "run_command",
      description: "Run a shell command in the project root. Dev servers are allowed after approval. Destructive commands require approval.",
      parameters: z.object({ command: z.string() }),
      execute: async (args, ctx) => {
        const command = String(args.command);
        await maybeAsk(ctx, "run_command", args, `Run ${command}`);
        ctx.onActivity(isDevServerCommand(command) ? "Starting development server" : `Running ${command}`, command);
        const result = await ctx.runCommand(command);
        return { output: result.output, urls: result.urls };
      },
    },
    {
      name: "terminal_output",
      description: "Read recent output from the integrated terminal.",
      parameters: z.object({ id: z.string().optional() }),
      execute: async (args, ctx) => ({ output: ctx.terminalOutput(args.id as string | undefined) || "(empty)" }),
    },
    {
      name: "git_status",
      description: "Show git status for the workspace.",
      parameters: z.object({}),
      execute: async (_args, ctx) => {
        ctx.onActivity("Checking git status");
        return { output: gitStatus(ctx.workspaceRoot) || gitSnapshot(ctx.workspaceRoot).status };
      },
    },
    {
      name: "git_diff",
      description: "Show git diff, optionally for one file.",
      parameters: z.object({ path: z.string().optional() }),
      execute: async (args, ctx) => ({ output: gitDiff(ctx.workspaceRoot, args.path as string | undefined) }),
    },
    {
      name: "git_log",
      description: "Show recent commit history.",
      parameters: z.object({ limit: z.number().int().positive().optional() }),
      execute: async (args, ctx) => ({ output: gitLog(ctx.workspaceRoot, (args.limit as number | undefined) ?? 20) }),
    },
    {
      name: "git_stage",
      description: "Stage a file. Requires approval.",
      parameters: z.object({ path: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "git_stage", args, `Stage ${args.path}`);
        return { output: gitStage(ctx.workspaceRoot, String(args.path)) };
      },
    },
    {
      name: "git_unstage",
      description: "Unstage a file.",
      parameters: z.object({ path: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "git_unstage", args, `Unstage ${args.path}`);
        return { output: gitUnstage(ctx.workspaceRoot, String(args.path)) };
      },
    },
    {
      name: "git_commit",
      description: "Create a local commit. Requires approval. Never pushes.",
      parameters: z.object({ message: z.string() }),
      execute: async (args, ctx) => {
        await maybeAsk(ctx, "git_commit", args, `Commit: ${args.message}`);
        return { output: gitCommit(ctx.workspaceRoot, String(args.message)) };
      },
    },
    ...browserTools(),
  ];
}

async function requireBrowser(ctx: ToolContext, url?: string): Promise<BrowserWorkspace> {
  if (ctx.ensureBrowser) return ctx.ensureBrowser(url);
  const session = ctx.browser();
  if (!session) throw new Error("No browser tab is attached. Open the Browser tab first.");
  if (url) await session.navigate(url);
  return session;
}

function browser(): ForgeTool[] {
  return [
    {
      name: "browser_open",
      description: "Open or navigate the embedded browser to a URL. Use this to connect to a live page.",
      parameters: z.object({ url: z.string() }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Opening ${args.url}`);
        const session = await requireBrowser(ctx, String(args.url));
        return { output: `Opened ${await session.getUrl()}`, urls: [String(args.url)] };
      },
    },
    {
      name: "browser_navigate",
      description: "Navigate the embedded browser.",
      parameters: z.object({ url: z.string() }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Navigating ${args.url}`);
        const session = await requireBrowser(ctx, String(args.url));
        return { output: `Navigated to ${await session.getUrl()}` };
      },
    },
    {
      name: "browser_reload",
      description: "Reload the current page in the embedded browser.",
      parameters: z.object({}),
      execute: async (_args, ctx) => {
        const session = await requireBrowser(ctx);
        await session.reload();
        return { output: `Reloaded ${await session.getUrl()}` };
      },
    },
    {
      name: "browser_click",
      description: "Click a DOM element by CSS selector.",
      parameters: z.object({ selector: z.string() }),
      execute: async (args, ctx) => {
        ctx.onActivity(`Clicking ${args.selector}`);
        return { output: await (await requireBrowser(ctx)).click(String(args.selector)) };
      },
    },
    {
      name: "browser_type",
      description: "Type into an input found by CSS selector.",
      parameters: z.object({ selector: z.string(), text: z.string() }),
      execute: async (args, ctx) => ({
        output: await (await requireBrowser(ctx)).type(String(args.selector), String(args.text)),
      }),
    },
    {
      name: "browser_press",
      description: "Press a keyboard key in the page.",
      parameters: z.object({ key: z.string() }),
      execute: async (args, ctx) => ({ output: await (await requireBrowser(ctx)).press(String(args.key)) }),
    },
    {
      name: "browser_scroll",
      description: "Scroll the page.",
      parameters: z.object({ dx: z.number().default(0), dy: z.number().default(400) }),
      execute: async (args, ctx) => ({
        output: await (await requireBrowser(ctx)).scroll(Number(args.dx ?? 0), Number(args.dy ?? 400)),
      }),
    },
    {
      name: "browser_screenshot",
      description: "Capture a PNG screenshot of the page (base64).",
      parameters: z.object({}),
      execute: async (_args, ctx) => {
        ctx.onActivity("Capturing screenshot");
        const image = await (await requireBrowser(ctx)).screenshot();
        return { output: `screenshot captured (${image.length} bytes base64)`, image };
      },
    },
    {
      name: "browser_get_dom",
      description: "Get a truncated HTML snapshot of the page.",
      parameters: z.object({}),
      execute: async (_args, ctx) => ({ output: await (await requireBrowser(ctx)).getDom() }),
    },
    {
      name: "browser_get_text",
      description: "Get visible text from the page.",
      parameters: z.object({}),
      execute: async (_args, ctx) => ({ output: await (await requireBrowser(ctx)).getText() }),
    },
    {
      name: "browser_evaluate",
      description: "Evaluate JavaScript in the page.",
      parameters: z.object({ expression: z.string() }),
      execute: async (args, ctx) => {
        const value = await (await requireBrowser(ctx)).evaluate(String(args.expression));
        return { output: typeof value === "string" ? value : JSON.stringify(value) };
      },
    },
    {
      name: "browser_wait",
      description: "Wait a number of milliseconds.",
      parameters: z.object({ ms: z.number().int().positive() }),
      execute: async (args, ctx) => ({ output: await (await requireBrowser(ctx)).wait(Number(args.ms)) }),
    },
    {
      name: "browser_get_url",
      description: "Return the current page URL.",
      parameters: z.object({}),
      execute: async (_args, ctx) => ({ output: await (await requireBrowser(ctx)).getUrl() }),
    },
    {
      name: "browser_console",
      description: "Read captured browser console logs.",
      parameters: z.object({}),
      execute: async (_args, ctx) => ({
        output: JSON.stringify((await requireBrowser(ctx)).consoleDump(), null, 2),
      }),
    },
    {
      name: "browser_errors",
      description: "Read browser console errors and failed network requests.",
      parameters: z.object({}),
      execute: async (_args, ctx) => {
        const session = await requireBrowser(ctx);
        return {
          output: JSON.stringify(
            { console: session.consoleDump(true), network: session.networkDump(true) },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "browser_network",
      description: "Read captured network requests.",
      parameters: z.object({ failedOnly: z.boolean().optional() }),
      execute: async (args, ctx) => ({
        output: JSON.stringify((await requireBrowser(ctx)).networkDump(Boolean(args.failedOnly)), null, 2),
      }),
    },
    {
      name: "browser_inspect_element",
      description: "Inspect a DOM element by selector, or return the user-selected inspect target.",
      parameters: z.object({ selector: z.string().optional() }),
      execute: async (args, ctx) => {
        const session = await requireBrowser(ctx);
        if (args.selector) {
          const el = await session.inspectSelector(String(args.selector));
          return { output: JSON.stringify(el, null, 2) };
        }
        if (session.lastInspect) return { output: JSON.stringify(session.lastInspect, null, 2) };
        return { output: "No element selected. Enable inspect mode and click an element, or pass selector." };
      },
    },
    {
      name: "browser_computed_style",
      description: "Get computed CSS for a selector.",
      parameters: z.object({ selector: z.string() }),
      execute: async (args, ctx) => ({
        output: JSON.stringify(await (await requireBrowser(ctx)).computedStyle(String(args.selector)), null, 2),
      }),
    },
  ];
}

function browserTools(): ForgeTool[] {
  return browser();
}

export { createDirectory };
