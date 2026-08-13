import { spawnSync } from "node:child_process";
import type { GitSnapshot } from "@forge/shared";

function git(root: string, args: string[]): { ok: boolean; text: string } {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, text };
}

export function gitStatus(root: string): string {
  return git(root, ["status", "--short", "--branch"]).text;
}

export function gitDiff(root: string, file?: string): string {
  const args = file ? ["diff", "--", file] : ["diff"];
  return git(root, args).text || "(no unstaged diff)";
}

export function gitLog(root: string, limit = 20): string {
  return git(root, ["log", `-${limit}`, "--oneline", "--decorate"]).text;
}

export function gitSnapshot(root: string): GitSnapshot {
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).text || "detached";
  const status = gitStatus(root);
  const changed = status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("##"))
    .map((line) => line.replace(/^[A-Z?!\s]{1,3}/, "").trim())
    .filter(Boolean);
  let ahead = 0;
  let behind = 0;
  const header = status.split("\n").find((l) => l.startsWith("##")) ?? "";
  const aheadMatch = header.match(/ahead\s+(\d+)/);
  const behindMatch = header.match(/behind\s+(\d+)/);
  if (aheadMatch) ahead = Number(aheadMatch[1]);
  if (behindMatch) behind = Number(behindMatch[1]);
  return { branch, ahead, behind, status, changed };
}

export function gitStage(root: string, file: string): string {
  return git(root, ["add", "--", file]).text || `staged ${file}`;
}

export function gitUnstage(root: string, file: string): string {
  return git(root, ["restore", "--staged", "--", file]).text || `unstaged ${file}`;
}

export function gitCommit(root: string, message: string): string {
  const result = git(root, ["commit", "-m", message]);
  return result.text || (result.ok ? "committed" : "commit failed");
}
