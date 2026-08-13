import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { grokAuthStatus, resolveGrokAccessToken } from "@forge/oauth";
import type { AuthStatus } from "@forge/shared";

function keyFile(): string {
  return path.join(app.getPath("userData"), "secret.bin");
}

export function saveApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    if (fs.existsSync(keyFile())) fs.unlinkSync(keyFile());
    const plain = `${keyFile()}.txt`;
    if (fs.existsSync(plain)) fs.unlinkSync(plain);
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyFile(), safeStorage.encryptString(trimmed));
    return;
  }
  fs.writeFileSync(`${keyFile()}.txt`, trimmed, "utf8");
}

export function readStoredApiKey(): string | null {
  try {
    if (fs.existsSync(keyFile()) && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(fs.readFileSync(keyFile()));
    }
    const plain = `${keyFile()}.txt`;
    if (fs.existsSync(plain)) return fs.readFileSync(plain, "utf8").trim();
  } catch {
    return null;
  }
  return process.env.XAI_API_KEY?.trim() || null;
}

export function readApiKey(): string | null {
  return readStoredApiKey();
}

export async function resolveAccessToken(): Promise<string | null> {
  return (await resolveGrokAccessToken()) || readStoredApiKey();
}

export function getAuthStatus(): AuthStatus {
  return grokAuthStatus(Boolean(readStoredApiKey()));
}

export function hasApiKey(): boolean {
  return getAuthStatus().signedIn;
}
