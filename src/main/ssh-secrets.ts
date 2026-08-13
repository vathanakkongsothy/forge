import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

type SecretMap = Record<string, string>;

function secretFile(): string {
  return path.join(app.getPath("userData"), "ssh-secrets.bin");
}

function readAll(): SecretMap {
  try {
    const file = secretFile();
    if (fs.existsSync(file) && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as SecretMap;
    }
    const plain = `${secretFile()}.json`;
    if (fs.existsSync(plain)) return JSON.parse(fs.readFileSync(plain, "utf8")) as SecretMap;
  } catch {
    return {};
  }
  return {};
}

function writeAll(map: SecretMap): void {
  const payload = JSON.stringify(map);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(secretFile(), safeStorage.encryptString(payload));
    return;
  }
  fs.writeFileSync(`${secretFile()}.json`, payload, "utf8");
}

export function saveSshSecret(id: string, secret: string): void {
  const map = readAll();
  const trimmed = secret.trim();
  if (!trimmed) delete map[id];
  else map[id] = trimmed;
  writeAll(map);
}

export function readSshSecret(id: string): string | null {
  return readAll()[id] ?? null;
}

export function deleteSshSecret(id: string): void {
  const map = readAll();
  if (!(id in map)) return;
  delete map[id];
  writeAll(map);
}
