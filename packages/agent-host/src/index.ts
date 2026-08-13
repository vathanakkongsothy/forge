import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ForgeRuntime } from "./runtime";

const dataDir = process.env.FORGE_DATA_DIR || path.join(os.homedir(), "AppData", "Roaming", "com.phumi.forge");
const runtime = new ForgeRuntime(dataDir);
const clients = new Set<http.ServerResponse>();

runtime.on((event) => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(payload);
});

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && req.url && !req.url.startsWith("/rpc") && req.url !== "/events" && req.url !== "/health") {
    serveUi(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/rpc") {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body) as { method: string; params?: unknown };
      const result = await runtime.dispatch(parsed.method, parsed.params);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result }));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const port = Number(process.env.FORGE_HOST_PORT || 0);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actual}`;
  process.stdout.write(`FORGE_HOST=${url}\n`);
});

const uiRoot = path.resolve(process.env.FORGE_UI_DIR || path.join(process.cwd(), "dist"));

function serveUi(req: http.IncomingMessage, res: http.ServerResponse): void {
  const raw = decodeURIComponent((req.url ?? "/").split("?")[0] || "/");
  const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const file = path.normalize(path.join(uiRoot, relative));
  if (!file.startsWith(uiRoot)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(uiRoot, "index.html");
  if (!fs.existsSync(target)) {
    res.writeHead(404);
    res.end("UI not built. Run npm run vite:build");
    return;
  }
  const ext = path.extname(target).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  res.writeHead(200, { "content-type": types[ext] ?? "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
