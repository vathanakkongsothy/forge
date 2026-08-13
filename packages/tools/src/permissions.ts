import type { PermissionLevel } from "@forge/shared";

const ASK_COMMAND =
  /\b(git\s+(push|reset|clean|rebase)|sudo|ssh|rm\s+-rf|del\s+\/s|format|mkfs|deploy|kubectl|terraform)\b/i;

const SAFE_COMMAND =
  /^(git\s+(status|diff|log|branch|rev-parse|show)|npm\s+(-v|--version)|pnpm\s+(-v|--version)|node\s+(-v|--version)|dir|ls|pwd)(\s|$)/i;

export const SAFE_TOOLS = new Set([
  "read_file",
  "list_directory",
  "search_files",
  "search_code",
  "git_status",
  "git_diff",
  "git_log",
  "terminal_output",
  "browser_screenshot",
  "browser_get_dom",
  "browser_get_text",
  "browser_get_url",
  "browser_console",
  "browser_errors",
  "browser_network",
  "browser_inspect_element",
  "browser_computed_style",
  "browser_wait",
]);

export function commandRisk(command: string): PermissionLevel {
  if (ASK_COMMAND.test(command)) return "ask";
  if (SAFE_COMMAND.test(command.trim())) return "safe";
  return "ask";
}

export function toolRisk(name: string, args: Record<string, unknown>, mode: "ask" | "allowlist"): PermissionLevel {
  if (SAFE_TOOLS.has(name)) return "safe";
  if (name === "run_command") {
    const command = String(args.command ?? "");
    if (mode === "allowlist" && commandRisk(command) === "safe") return "safe";
    return "ask";
  }
  if (name === "delete_file") return "ask";
  return "ask";
}

export function isDevServerCommand(command: string): boolean {
  return /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b/i.test(command);
}
