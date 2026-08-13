import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { detectLocalUrls } from "@forge/shared";

export type TerminalDataHandler = (chunk: string) => void;

export interface PtyLike {
  id: string;
  cwd: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(handler: TerminalDataHandler): () => void;
}

type PtyCtor = new (file: string, args: string[], opts: {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (d: string) => void): void;
};

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const ps = process.env.ComSpec?.toLowerCase().includes("cmd")
      ? process.env.POWERSHELL ?? "powershell.exe"
      : process.env.COMSPEC ?? "powershell.exe";
    if (process.env.FORGE_SHELL) return { file: process.env.FORGE_SHELL, args: [] };
    return { file: process.env.ComSpec ? "powershell.exe" : ps, args: ["-NoLogo"] };
  }
  const shell = process.env.SHELL || "/bin/bash";
  return { file: shell, args: ["-l"] };
}

export function createPtySession(id: string, cwd: string): PtyLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pty = require("node-pty") as { spawn: (f: string, a: string[], o: object) => InstanceType<PtyCtor> };
    const { file, args } = defaultShell();
    const proc = pty.spawn(file, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 32,
      cwd,
      env: process.env,
    });
    return {
      id,
      cwd,
      write: (data) => proc.write(data),
      resize: (cols, rows) => proc.resize(cols, rows),
      kill: () => proc.kill(),
      onData: (handler) => {
        proc.onData(handler);
        return () => undefined;
      },
    };
  } catch {
    return createFallbackSession(id, cwd);
  }
}

function createFallbackSession(id: string, cwd: string): PtyLike {
  const { file, args } = defaultShell();
  const child: ChildProcessWithoutNullStreams = spawn(file, args, {
    cwd,
    env: process.env,
    windowsHide: true,
  });
  const bus = new EventEmitter();
  child.stdout.on("data", (buf: Buffer) => bus.emit("data", buf.toString("utf8")));
  child.stderr.on("data", (buf: Buffer) => bus.emit("data", buf.toString("utf8")));
  return {
    id,
    cwd,
    write: (data) => child.stdin.write(data),
    resize: () => undefined,
    kill: () => child.kill(),
    onData: (handler) => {
      bus.on("data", handler);
      return () => bus.off("data", handler);
    },
  };
}

export class TerminalManager {
  private sessions = new Map<string, PtyLike>();
  private buffers = new Map<string, string>();

  create(id: string, cwd: string, onData: (id: string, chunk: string) => void): PtyLike {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    return this.adopt(createPtySession(id, cwd), onData);
  }

  adopt(session: PtyLike, onData: (id: string, chunk: string) => void): PtyLike {
    this.kill(session.id);
    this.sessions.set(session.id, session);
    this.buffers.set(session.id, "");
    session.onData((chunk) => {
      const prev = this.buffers.get(session.id) ?? "";
      const next = (prev + chunk).slice(-80_000);
      this.buffers.set(session.id, next);
      onData(session.id, chunk);
    });
    return session;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(cols, rows);
  }

  kill(id: string): void {
    this.sessions.get(id)?.kill();
    this.sessions.delete(id);
  }

  output(id: string): string {
    return this.buffers.get(id) ?? "";
  }

  detectUrls(id: string): string[] {
    return detectLocalUrls(this.output(id));
  }

  list(): string[] {
    return [...this.sessions.keys()];
  }
}

export function extractDevServerUrls(text: string): string[] {
  return detectLocalUrls(text);
}
