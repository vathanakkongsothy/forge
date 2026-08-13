import fs from "node:fs";
import path from "node:path";
import { grokAuthStatus, resolveGrokAccessToken } from "@forge/oauth";
import type { AuthStatus } from "@forge/shared";

function keyFile(dataDir: string): string {
  return path.join(dataDir, "secret.txt");
}

export function saveApiKey(dataDir: string, key: string): void {
  const trimmed = key.trim();
  const file = keyFile(dataDir);
  if (!trimmed) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, trimmed, "utf8");
}

export function readStoredApiKey(dataDir: string): string | null {
  try {
    const file = keyFile(dataDir);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
  return process.env.XAI_API_KEY?.trim() || null;
}

export function readApiKey(dataDir: string): string | null {
  return readStoredApiKey(dataDir);
}

export async function resolveAccessToken(dataDir: string): Promise<string | null> {
  return (await resolveGrokAccessToken()) || readStoredApiKey(dataDir);
}

export function getAuthStatus(dataDir: string): AuthStatus {
  return grokAuthStatus(Boolean(readStoredApiKey(dataDir)));
}

export function hasApiKey(dataDir: string): boolean {
  return getAuthStatus(dataDir).signedIn;
}
