import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileEntry, PendingDiff } from "@forge/shared";

export const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  "uploads",
  ".forge",
]);

export function resolveInside(root: string, input: string): string {
  const abs = path.resolve(root, input);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the workspace: ${input}`);
  }
  return abs;
}

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function relativeToRoot(root: string, abs: string): string {
  return toPosix(path.relative(root, abs));
}

export function listDirectory(root: string, dirPath = "."): FileEntry[] {
  const abs = resolveInside(root, dirPath);
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.name !== ".DS_Store")
    .map((e) => ({
      name: e.name,
      path: toPosix(path.join(dirPath === "." ? "" : dirPath, e.name)),
      type: e.isDirectory() ? ("dir" as const) : ("file" as const),
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export function readFileText(root: string, filePath: string, offset?: number, limit?: number): string {
  const abs = resolveInside(root, filePath);
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) throw new Error("Refusing to read a binary file.");
  if (buf.length > 250_000) throw new Error("File too large. Use search or a line range.");
  const lines = buf.toString("utf8").split(/\n/);
  const start = Math.max(1, offset ?? 1);
  const take = limit ?? lines.length;
  return lines
    .slice(start - 1, start - 1 + take)
    .map((line, i) => `${String(start + i).padStart(5, " ")}|${line}`)
    .join("\n");
}

export function readFileRaw(root: string, filePath: string): string {
  const abs = resolveInside(root, filePath);
  return fs.readFileSync(abs, "utf8");
}

export function writeFileText(root: string, filePath: string, contents: string): PendingDiff {
  const abs = resolveInside(root, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  fs.writeFileSync(abs, contents, "utf8");
  return {
    id: randomUUID(),
    path: relativeToRoot(root, abs),
    before,
    after: contents,
    status: "pending",
    createdAt: Date.now(),
  };
}

export function editFile(root: string, filePath: string, oldString: string, newString: string): PendingDiff {
  const abs = resolveInside(root, filePath);
  if (!fs.existsSync(abs)) {
    if (oldString) throw new Error(`File does not exist: ${filePath}`);
    return writeFileText(root, filePath, newString);
  }
  const before = fs.readFileSync(abs, "utf8");
  if (!before.includes(oldString)) throw new Error(`old_string was not found in ${filePath}`);
  const after = before.replace(oldString, newString);
  fs.writeFileSync(abs, after, "utf8");
  return {
    id: randomUUID(),
    path: relativeToRoot(root, abs),
    before,
    after,
    status: "pending",
    createdAt: Date.now(),
  };
}

export function createFile(root: string, filePath: string, contents = ""): PendingDiff {
  const abs = resolveInside(root, filePath);
  if (fs.existsSync(abs)) throw new Error(`Already exists: ${filePath}`);
  return writeFileText(root, filePath, contents);
}

export function createDirectory(root: string, dirPath: string): string {
  fs.mkdirSync(resolveInside(root, dirPath), { recursive: true });
  return `created ${dirPath}`;
}

export function deletePath(root: string, target: string): string {
  const abs = resolveInside(root, target);
  fs.rmSync(abs, { recursive: true, force: true });
  return `deleted ${target}`;
}

export function renamePath(root: string, from: string, to: string): string {
  fs.renameSync(resolveInside(root, from), resolveInside(root, to));
  return `renamed ${from} -> ${to}`;
}

export function restoreFile(root: string, relPath: string, contents: string): void {
  const abs = resolveInside(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents, "utf8");
}

export function searchFiles(root: string, query: string): string[] {
  const hits: string[] = [];
  const q = query.toLowerCase();
  walk(root, root, (file) => {
    if (path.basename(file).toLowerCase().includes(q)) {
      hits.push(relativeToRoot(root, file));
    }
  });
  return hits.slice(0, 80);
}

export function searchCode(root: string, pattern: string, glob?: string): string {
  const rg = spawnSync(
    "rg",
    [
      "--line-number",
      "--no-heading",
      "--color",
      "never",
      "--max-count",
      "40",
      "--glob",
      "!node_modules",
      "--glob",
      "!.git",
      ...(glob ? ["--glob", glob] : []),
      pattern,
      ".",
    ],
    { cwd: root, encoding: "utf8", timeout: 15_000, windowsHide: true },
  );
  if (rg.status === 0 || rg.status === 1) return (rg.stdout || "").trim() || "No matches.";
  return fallbackSearch(root, pattern).join("\n") || "No matches.";
}

function fallbackSearch(root: string, pattern: string): string[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  const matches: string[] = [];
  walk(root, root, (file) => {
    if (matches.length >= 80) return;
    try {
      const buf = fs.readFileSync(file);
      if (buf.includes(0) || buf.length > 300_000) return;
      buf
        .toString("utf8")
        .split("\n")
        .forEach((line, i) => {
          if (matches.length < 80 && re.test(line)) {
            matches.push(`${relativeToRoot(root, file)}:${i + 1}:${line.slice(0, 220)}`);
          }
        });
    } catch {
      /* ignore */
    }
  });
  return matches;
}

function walk(root: string, dir: string, visit: (file: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, visit);
    else if (entry.isFile()) visit(full);
  }
}
