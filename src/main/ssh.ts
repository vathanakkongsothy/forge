import fs from "node:fs";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type { PtyLike } from "@forge/terminal";
import type { SshProfile } from "@forge/shared";

export type SshConnectInput = {
  profile: SshProfile;
  secret?: string | null;
};

export function createSshSession(
  id: string,
  input: SshConnectInput,
  onStatus: (status: "connecting" | "connected" | "error" | "disconnected", error?: string) => void,
): PtyLike {
  const client = new Client();
  let stream: ClientChannel | null = null;
  const listeners = new Set<(chunk: string) => void>();
  let cols = 120;
  let rows = 32;
  let closed = false;

  const emit = (chunk: string) => {
    for (const listener of listeners) listener(chunk);
  };

  onStatus("connecting");
  emit(`Connecting to ${input.profile.username}@${input.profile.host}:${input.profile.port}...\r\n`);

  client
    .on("ready", () => {
      client.shell({ term: "xterm-256color", cols, rows }, (err, next) => {
        if (err) {
          onStatus("error", err.message);
          emit(`\r\nSSH shell failed: ${err.message}\r\n`);
          client.end();
          return;
        }
        stream = next;
        onStatus("connected");
        emit(`Connected.\r\n`);
        next.on("data", (buf: Buffer) => emit(buf.toString("utf8")));
        next.stderr?.on("data", (buf: Buffer) => emit(buf.toString("utf8")));
        next.on("close", () => {
          onStatus("disconnected");
          emit("\r\n[SSH session closed]\r\n");
          client.end();
        });
      });
    })
    .on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => input.secret ?? ""));
    })
    .on("error", (err) => {
      if (closed) return;
      onStatus("error", err.message);
      emit(`\r\nSSH error: ${err.message}\r\n`);
    })
    .on("close", () => {
      if (closed) return;
      closed = true;
    });

  const config: ConnectConfig = {
    host: input.profile.host,
    port: input.profile.port || 22,
    username: input.profile.username,
    readyTimeout: 20_000,
    tryKeyboard: input.profile.auth === "password",
    keepaliveInterval: 15_000,
  };

  if (input.profile.auth === "password") {
    config.password = input.secret ?? "";
  } else if (input.profile.auth === "key") {
    if (input.profile.keyPath && fs.existsSync(input.profile.keyPath)) {
      config.privateKey = fs.readFileSync(input.profile.keyPath);
      if (input.secret) config.passphrase = input.secret;
    }
  } else {
    config.agent = process.env.SSH_AUTH_SOCK || (process.platform === "win32" ? "pageant" : undefined);
  }

  client.connect(config);

  return {
    id,
    cwd: `${input.profile.username}@${input.profile.host}`,
    write(data) {
      stream?.write(data);
    },
    resize(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      stream?.setWindow(nextRows, nextCols, 0, 0);
    },
    kill() {
      closed = true;
      try {
        stream?.end();
      } catch {
        /* ignore */
      }
      client.end();
      onStatus("disconnected");
    },
    onData(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
}
