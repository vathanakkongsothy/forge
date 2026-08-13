import fs from "node:fs";
import type { DbColumnInfo, DbEditOp, DbEngine, DbProfile, DbQueryResult, DbRowValue, DbTableInfo } from "@forge/shared";

const MAX_ROWS = 500;

export type LiveDb = {
  engine: DbEngine;
  query(sql: string, params?: unknown[]): Promise<DbQueryResult>;
  databases(): Promise<string[]>;
  currentDatabase(): string | null;
  tables(): Promise<DbTableInfo[]>;
  columns(table: string, schema?: string): Promise<DbColumnInfo[]>;
  applyEdits(ops: DbEditOp[]): Promise<{ applied: number }>;
  close(): Promise<void>;
};

export function isMutatingSql(sql: string): boolean {
  return /^\s*(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke)\b/i.test(sql);
}

function serialize(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pack(started: number, rows: Array<Record<string, unknown>>): DbQueryResult {
  const sliced = rows.slice(0, MAX_ROWS);
  const columns = sliced[0] ? Object.keys(sliced[0]) : [];
  return {
    columns,
    rows: sliced.map((row) => Object.fromEntries(columns.map((key) => [key, serialize(row[key])]))),
    rowCount: rows.length,
    truncated: rows.length > MAX_ROWS,
    durationMs: Date.now() - started,
  };
}

export async function openDatabase(profile: DbProfile, secret?: string | null): Promise<LiveDb> {
  if (profile.engine === "sqlite") return openSqlite(profile);
  if (profile.engine === "postgres") return openPostgres(profile, secret);
  return openMysql(profile, secret);
}

function openSqlite(profile: DbProfile): LiveDb {
  if (!profile.filePath || !fs.existsSync(profile.filePath)) {
    throw new Error("SQLite file not found.");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as new (file: string, opts?: { readonly?: boolean }) => {
    prepare(sql: string): { all: (...args: unknown[]) => Array<Record<string, unknown>>; run: (...args: unknown[]) => { changes: number } };
    close(): void;
  };
  const db = new Database(profile.filePath);
  const label = profile.filePath.split(/[/\\]/).pop() || profile.filePath;
  return {
    engine: "sqlite",
    async databases() {
      return [label];
    },
    currentDatabase() {
      return label;
    },
    async query(sql, params = []) {
      const started = Date.now();
      const stmt = db.prepare(sql);
      if (isMutatingSql(sql)) {
        const result = stmt.run(...params);
        return {
          columns: ["changes"],
          rows: [{ changes: result.changes }],
          rowCount: 1,
          truncated: false,
          durationMs: Date.now() - started,
        };
      }
      return pack(started, stmt.all(...params));
    },
    async tables() {
      const rows = db
        .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as Array<{ name: string; type: string }>;
      return rows.map((row) => ({ name: row.name, type: row.type === "view" ? "view" : "table" }));
    },
    async columns(table) {
      const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;
      return rows.map((row) => ({
        name: row.name,
        type: row.type || "TEXT",
        nullable: !row.notnull,
        key: row.pk ? "PK" : undefined,
      }));
    },
    async applyEdits(ops) {
      return applyOps("sqlite", ops, (sql, params) => {
        db.prepare(sql).run(...params);
      });
    },
    async close() {
      db.close();
    },
  };
}

async function openPostgres(profile: DbProfile, secret?: string | null): Promise<LiveDb> {
  const { Client } = await import("pg");
  const client = new Client({
    host: profile.host,
    port: profile.port || 5432,
    user: profile.username,
    password: secret ?? "",
    database: profile.database || "postgres",
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 12_000,
  });
  await client.connect();
  const opened = profile.database || "postgres";
  return {
    engine: "postgres",
    async databases() {
      const result = await client.query(
        `SELECT datname AS name
         FROM pg_database
         WHERE datallowconn
         ORDER BY datname`,
      );
      return result.rows.map((row: { name: string }) => row.name);
    },
    currentDatabase() {
      return opened;
    },
    async query(sql, params = []) {
      const started = Date.now();
      const result = await client.query(sql, params);
      const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
      if (isMutatingSql(sql) && !rows.length) {
        return {
          columns: ["rowCount"],
          rows: [{ rowCount: result.rowCount ?? 0 }],
          rowCount: 1,
          truncated: false,
          durationMs: Date.now() - started,
        };
      }
      return pack(started, rows);
    },
    async tables() {
      const result = await client.query(
        `SELECT table_schema AS schema, table_name AS name, table_type AS type
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog','information_schema')
         ORDER BY table_schema, table_name`,
      );
      return result.rows.map((row: { schema: string; name: string; type: string }) => ({
        schema: row.schema,
        name: row.name,
        type: /view/i.test(row.type) ? "view" : "table",
      }));
    },
    async columns(table, schema) {
      const result = await client.query(
        `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
                CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'PK' END AS key
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage kcu
           ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
         LEFT JOIN information_schema.table_constraints tc
           ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
          AND tc.constraint_type = 'PRIMARY KEY'
         WHERE c.table_name = $1 AND c.table_schema = $2
         ORDER BY c.ordinal_position`,
        [table, schema || "public"],
      );
      return result.rows.map((row: { name: string; type: string; nullable: string; key?: string }) => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable === "YES",
        key: row.key || undefined,
      }));
    },
    async applyEdits(ops) {
      return applyOps("postgres", ops, async (sql, params) => {
        await client.query(sql, params);
      });
    },
    async close() {
      await client.end();
    },
  };
}

async function openMysql(profile: DbProfile, secret?: string | null): Promise<LiveDb> {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host: profile.host,
    port: profile.port || 3306,
    user: profile.username,
    password: secret ?? "",
    database: profile.database || undefined,
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 12_000,
  });
  const opened = profile.database || null;
  return {
    engine: "mysql",
    async databases() {
      const [raw] = await conn.query(
        `SELECT schema_name AS name
         FROM information_schema.schemata
         ORDER BY schema_name`,
      );
      return (raw as Array<{ name: string }>).map((row) => row.name);
    },
    currentDatabase() {
      return opened;
    },
    async query(sql, params = []) {
      const started = Date.now();
      const [raw] = await conn.query(sql, params);
      const rows = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
      if (isMutatingSql(sql) && !rows.length) {
        const header = raw as { affectedRows?: number };
        return {
          columns: ["affectedRows"],
          rows: [{ affectedRows: header.affectedRows ?? 0 }],
          rowCount: 1,
          truncated: false,
          durationMs: Date.now() - started,
        };
      }
      return pack(started, rows);
    },
    async tables() {
      const [raw] = await conn.query(
        `SELECT table_schema AS \`schema\`, table_name AS name, table_type AS type
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
         ORDER BY table_name`,
      );
      return (raw as Array<{ schema: string; name: string; type: string }>).map((row) => ({
        schema: row.schema,
        name: row.name,
        type: /view/i.test(row.type) ? "view" : "table",
      }));
    },
    async columns(table, schema) {
      const [raw] = await conn.query(
        `SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS colkey
         FROM information_schema.columns
         WHERE table_name = ? AND table_schema = COALESCE(?, DATABASE())
         ORDER BY ordinal_position`,
        [table, schema ?? null],
      );
      return (raw as Array<{ name: string; type: string; nullable: string; colkey: string }>).map((row) => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable === "YES",
        key: row.colkey || undefined,
      }));
    },
    async applyEdits(ops) {
      return applyOps("mysql", ops, async (sql, params) => {
        await conn.query(sql, params);
      });
    },
    async close() {
      await conn.end();
    },
  };
}

function quoteIdent(name: string, engine: DbEngine = "sqlite"): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid identifier.");
  return engine === "mysql" ? `\`${name}\`` : `"${name}"`;
}

function qualify(engine: DbEngine, table: string, schema?: string): string {
  return schema ? `${quoteIdent(schema, engine)}.${quoteIdent(table, engine)}` : quoteIdent(table, engine);
}

function placeholder(engine: DbEngine, index: number): string {
  return engine === "postgres" ? `$${index}` : "?";
}

async function applyOps(
  engine: DbEngine,
  ops: DbEditOp[],
  run: (sql: string, params: unknown[]) => Promise<unknown> | unknown,
): Promise<{ applied: number }> {
  let applied = 0;
  for (const op of ops) {
    const table = qualify(engine, op.table, op.schema);
    if (op.kind === "insert") {
      const keys = Object.keys(op.values);
      if (!keys.length) continue;
      const params = keys.map((key) => coerce(op.values[key]));
      const cols = keys.map((key) => quoteIdent(key, engine)).join(", ");
      const values = keys.map((_, i) => placeholder(engine, i + 1)).join(", ");
      await run(`INSERT INTO ${table} (${cols}) VALUES (${values})`, params);
      applied += 1;
      continue;
    }
    const whereKeys = Object.keys(op.where);
    if (!whereKeys.length) throw new Error("Cannot edit a row without a primary key.");
    const setKeys = op.kind === "update" ? Object.keys(op.values) : [];
    const params: unknown[] = [];
    let sql = "";
    if (op.kind === "update") {
      if (!setKeys.length) continue;
      const sets = setKeys.map((key) => {
        params.push(coerce(op.values[key]));
        return `${quoteIdent(key, engine)} = ${placeholder(engine, params.length)}`;
      });
      const where = whereKeys.map((key) => {
        params.push(coerce(op.where[key]));
        return `${quoteIdent(key, engine)} = ${placeholder(engine, params.length)}`;
      });
      sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE ${where.join(" AND ")}`;
    } else {
      const where = whereKeys.map((key) => {
        params.push(coerce(op.where[key]));
        return `${quoteIdent(key, engine)} = ${placeholder(engine, params.length)}`;
      });
      sql = `DELETE FROM ${table} WHERE ${where.join(" AND ")}`;
    }
    await run(sql, params);
    applied += 1;
  }
  return { applied };
}

function coerce(value: DbRowValue): unknown {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (text === "" || text.toUpperCase() === "NULL") return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  return text;
}
