import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Cylinder,
  Database,
  Eye,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import type {
  AppState,
  DbCatalogInfo,
  DbColumnInfo,
  DbEditOp,
  DbEngine,
  DbProfile,
  DbProfileInput,
  DbQueryResult,
  DbRowValue,
  DbTableInfo,
} from "@forge/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const emptyForm: DbProfileInput = {
  name: "",
  engine: "postgres",
  host: "127.0.0.1",
  port: 5432,
  username: "",
  database: "",
  filePath: "",
  ssl: false,
  secret: "",
};

type DraftRow = {
  key: string;
  origin: Record<string, DbRowValue> | null;
  values: Record<string, DbRowValue>;
  deleted: boolean;
};

type Explorer = "catalog" | "tables" | "data";

function toDrafts(rows: Array<Record<string, DbRowValue>>, prefix: string): DraftRow[] {
  return rows.map((row, index) => ({
    key: `${prefix}-${index}`,
    origin: { ...row },
    values: { ...row },
    deleted: false,
  }));
}

export function DatabasePane({ state }: { state: AppState }) {
  const [form, setForm] = useState<DbProfileInput | null>(null);
  const [activeId, setActiveId] = useState<string | null>(state.dbProfiles[0]?.id ?? null);
  const [catalog, setCatalog] = useState<DbCatalogInfo[]>([]);
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [columns, setColumns] = useState<DbColumnInfo[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [openedTable, setOpenedTable] = useState<DbTableInfo | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<Explorer>("catalog");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [sql, setSql] = useState("SELECT 1");
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingMutate, setPendingMutate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const connections = useMemo(
    () => new Map((state.dbConnections ?? []).map((item) => [item.profileId, item])),
    [state.dbConnections],
  );
  const profiles = state.dbProfiles ?? [];
  const active = profiles.find((item) => item.id === activeId) ?? null;
  const status = active ? connections.get(active.id) : undefined;
  const currentDb = status?.currentDatabase || active?.database || null;
  const openedDb = selectedDb || (active?.engine === "sqlite" ? currentDb : null);
  const q = filter.trim().toLowerCase();
  const visibleCatalog = catalog.filter((item) => !q || item.name.toLowerCase().includes(q));
  const visibleTables = tables.filter((item) => {
    const label = item.schema ? `${item.schema}.${item.name}` : item.name;
    return !q || label.toLowerCase().includes(q);
  });
  const pkCols = useMemo(() => columns.filter(isPrimaryKey).map((col) => col.name), [columns]);
  const gridColumns = result?.columns.length ? result.columns : columns.map((col) => col.name);
  const canEdit = Boolean(openedTable && openedTable.type !== "view");
  const dirtyCount = useMemo(() => countDirty(drafts, gridColumns), [drafts, gridColumns]);
  const gridSource = !openedTable ? "query" : openedTable.type === "view" ? "view" : "table";
  const tableGroups = useMemo(() => groupTables(visibleTables), [visibleTables]);
  const serverEngine = Boolean(active && active.engine !== "sqlite");
  const { user: userDbs, system: systemDbs } = useMemo(
    () => splitCatalog(visibleCatalog, active?.engine ?? "postgres"),
    [visibleCatalog, active?.engine],
  );
  const didHydrate = useRef(false);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const id = activeId;
    if (!id) return;
    const profile = profiles.find((item) => item.id === id);
    const link = connections.get(id);
    if (!profile || link?.status !== "connected") return;
    void (async () => {
      setBusy(true);
      setBusyLabel("Loading…");
      try {
        if (profile.engine === "sqlite") {
          await refreshTables(id);
          setSelectedDb(link.currentDatabase || profile.filePath?.split(/[/\\]/).pop() || "sqlite");
          setExplorer("tables");
        } else {
          await refreshCatalog(id);
          setSelectedDb(null);
          setExplorer("catalog");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setBusyLabel(null);
      }
    })();
  }, []);

  function resetWorkspace() {
    setColumns([]);
    setActiveTable(null);
    setOpenedTable(null);
    setDrafts([]);
    setResult(null);
    setPendingMutate(null);
  }

  async function refreshCatalog(id: string) {
    setCatalog(await window.forge.dbDatabases(id));
  }

  async function refreshTables(id: string) {
    setTables(await window.forge.dbTables(id));
  }

  async function connect(id: string) {
    const profile = profiles.find((item) => item.id === id);
    setError(null);
    setBusy(true);
    setBusyLabel("Connecting…");
    try {
      await window.forge.dbConnect(id);
      setActiveId(id);
      resetWorkspace();
      if (!profile || profile.engine === "sqlite") {
        await refreshTables(id);
        setSelectedDb(profile?.filePath?.split(/[/\\]/).pop() || "sqlite");
        setExplorer("tables");
        setCatalog([]);
        setSql("SELECT 1");
        return;
      }
      await refreshCatalog(id);
      if (profile.database) {
        await refreshTables(id);
        setSelectedDb(profile.database);
        setExplorer("tables");
        setSql(`-- ${profile.database}\nSELECT 1`);
      } else {
        setTables([]);
        setSelectedDb(null);
        setExplorer("catalog");
        setSql("SELECT 1");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function selectProfile(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setError(null);
    resetWorkspace();
    setFilter("");
    const profile = profiles.find((item) => item.id === id);
    const link = connections.get(id);
    if (!profile || link?.status !== "connected") {
      setCatalog([]);
      setTables([]);
      setSelectedDb(null);
      setExplorer("catalog");
      return;
    }
    setBusy(true);
    setBusyLabel("Loading…");
    try {
      if (profile.engine === "sqlite") {
        await refreshTables(id);
        setSelectedDb(link.currentDatabase || profile.filePath?.split(/[/\\]/).pop() || "sqlite");
        setExplorer("tables");
        setCatalog([]);
        return;
      }
      await refreshCatalog(id);
      if (link.currentDatabase && profile.database === link.currentDatabase) {
        await refreshTables(id);
        setSelectedDb(link.currentDatabase);
        setExplorer("tables");
      } else {
        setTables([]);
        setSelectedDb(null);
        setExplorer("catalog");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function openDatabase(name: string) {
    if (!active) return;
    if (selectedDb === name && tables.length) {
      resetWorkspace();
      setExplorer("tables");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyLabel(`Opening ${name}…`);
    try {
      await window.forge.dbOpen(active.id, name);
      await refreshCatalog(active.id);
      const nextTables = await window.forge.dbTables(active.id);
      setTables(nextTables);
      setSelectedDb(name);
      resetWorkspace();
      setSql(`-- ${name}\nSELECT 1`);
      setExplorer("tables");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  function showCatalog() {
    if (!serverEngine) return;
    resetWorkspace();
    setExplorer("catalog");
  }

  function showTables() {
    if (!openedDb) {
      showCatalog();
      return;
    }
    resetWorkspace();
    setExplorer("tables");
  }

  async function run(confirm = false) {
    if (!active) return;
    setError(null);
    setPendingMutate(null);
    setBusy(true);
    setBusyLabel("Running…");
    try {
      const next = await window.forge.dbQuery(active.id, sql, confirm);
      setResult(next);
      setOpenedTable(null);
      setDrafts(toDrafts(next.rows, "q"));
      setExplorer("data");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Confirm to run")) setPendingMutate(sql);
      else setError(message);
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function openTable(table: DbTableInfo) {
    if (!active) return;
    const qualified = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`;
    const nextSql =
      active.engine === "mysql"
        ? `SELECT * FROM \`${table.name}\` LIMIT 100`
        : `SELECT * FROM ${qualified} LIMIT 100`;
    setActiveTable(`${table.schema ?? ""}.${table.name}`);
    setOpenedTable(table);
    setSql(nextSql);
    setError(null);
    setBusy(true);
    setBusyLabel(`Loading ${table.name}…`);
    setExplorer("data");
    try {
      const cols = await window.forge.dbColumns(active.id, table.name, table.schema);
      const next = await window.forge.dbQuery(active.id, nextSql);
      const withCols = next.columns.length ? next : { ...next, columns: cols.map((col) => col.name) };
      setColumns(cols);
      setResult(withCols);
      setDrafts(toDrafts(withCols.rows, "r"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  function setCell(key: string, column: string, value: string) {
    setDrafts((prev) =>
      prev.map((row) => (row.key === key ? { ...row, values: { ...row.values, [column]: value } } : row)),
    );
  }

  function toggleDelete(key: string) {
    setDrafts((prev) => {
      const target = prev.find((row) => row.key === key);
      if (!target) return prev;
      if (target.origin === null) return prev.filter((row) => row.key !== key);
      return prev.map((row) => (row.key === key ? { ...row, deleted: !row.deleted } : row));
    });
  }

  function addRow() {
    if (!canEdit) return;
    const values: Record<string, DbRowValue> = {};
    for (const name of gridColumns) values[name] = "";
    setDrafts((prev) => [...prev, { key: `n-${Date.now()}`, origin: null, values, deleted: false }]);
  }

  function discardEdits() {
    setDrafts((prev) =>
      prev
        .filter((row) => row.origin)
        .map((row) => ({ ...row, values: { ...row.origin! }, deleted: false })),
    );
  }

  async function saveEdits() {
    if (!active || !openedTable || !canEdit) return;
    let ops: DbEditOp[];
    try {
      ops = buildOps(openedTable, columns, drafts, pkCols);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!ops.length) return;
    const label = openedTable.schema ? `${openedTable.schema}.${openedTable.name}` : openedTable.name;
    if (!window.confirm(`Write ${ops.length} change${ops.length === 1 ? "" : "s"} to ${label}?`)) return;
    setError(null);
    setBusy(true);
    setBusyLabel("Saving…");
    try {
      await window.forge.dbApplyEdits(active.id, ops);
      await openTable(openedTable);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setBusyLabel(null);
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Database className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <Breadcrumb
            connection={active?.name ?? "Database"}
            database={openedDb}
            table={openedTable?.name ?? (explorer === "data" ? "Query" : null)}
            onConnection={() => (serverEngine ? showCatalog() : showTables())}
            onDatabase={showTables}
          />
          <div className="truncate text-[11px] text-muted">
            {busyLabel
              ? busyLabel
              : active
                ? `${engineLabel(active.engine)} · ${summary(active)}`
                : "No connection selected"}
          </div>
        </div>
        {status ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", statusChip(status.status))}>
            {status.status}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {status?.status === "connected" && explorer !== "data" ? (
            <Button size="sm" variant="ghost" onClick={() => setExplorer("data")}>
              <Code2 className="h-3.5 w-3.5" />
              Query
            </Button>
          ) : null}
          {active && status?.status === "connected" ? (
            <Button size="sm" variant="outline" onClick={() => void window.forge.dbDisconnect(active.id)}>
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button size="sm" disabled={!active || busy} onClick={() => active && void connect(active.id)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Connect
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setForm({ ...emptyForm })}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card/40">
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input
                value={filter}
                placeholder={explorer === "catalog" ? "Filter databases" : "Filter tables"}
                className="h-7 w-full bg-transparent text-[12px] outline-none"
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {!profiles.length && !form ? <EmptySidebar onNew={() => setForm({ ...emptyForm })} /> : null}
            {profiles.map((profile) => {
              const link = connections.get(profile.id);
              const open = profile.id === activeId;
              return (
                <div key={profile.id} className="mb-1">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                      open ? "bg-accent/10" : "hover:bg-secondary",
                    )}
                    onClick={() => void selectProfile(profile.id)}
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
                    <span className={cn("h-1.5 w-1.5 rounded-full", dot(link?.status))} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{profile.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted">{engineLabel(profile.engine)}</div>
                    </div>
                  </button>
                  {open ? (
                    <div className="mb-2 ml-4 border-l border-border pl-2">
                      <div className="my-1 flex gap-1">
                        {link?.status === "connected" ? (
                          <Button size="sm" variant="ghost" onClick={() => void window.forge.dbDisconnect(profile.id)}>
                            Disconnect
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void connect(profile.id)}>
                            Connect
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setForm(toForm(profile))}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void window.forge.dbDelete(profile.id)}>
                          Delete
                        </Button>
                      </div>
                      {link?.status === "connected" && profile.engine !== "sqlite" ? (
                        <TreeSection
                          title="Databases"
                          count={catalog.length}
                          onRefresh={() => void refreshCatalog(profile.id)}
                          empty="No databases"
                        >
                          {userDbs.map((item) => (
                            <DatabaseTree
                              key={item.name}
                              item={item}
                              opened={openedDb === item.name}
                              tables={openedDb === item.name ? tableGroups : []}
                              activeTable={activeTable}
                              onOpen={() => void openDatabase(item.name)}
                              onTable={openTable}
                            />
                          ))}
                          {systemDbs.length ? (
                            <div className="mt-1">
                              <button
                                type="button"
                                className="flex w-full items-center gap-1 px-1 py-1 text-[10px] uppercase tracking-wide text-muted"
                                onClick={() => setShowSystem((value) => !value)}
                              >
                                {showSystem ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                System
                                <span className="normal-case tracking-normal">{systemDbs.length}</span>
                              </button>
                              {showSystem
                                ? systemDbs.map((item) => (
                                    <DatabaseTree
                                      key={item.name}
                                      item={item}
                                      opened={openedDb === item.name}
                                      tables={openedDb === item.name ? tableGroups : []}
                                      activeTable={activeTable}
                                      onOpen={() => void openDatabase(item.name)}
                                      onTable={openTable}
                                    />
                                  ))
                                : null}
                            </div>
                          ) : null}
                        </TreeSection>
                      ) : null}
                      {link?.status === "connected" && profile.engine === "sqlite" ? (
                        <TreeSection
                          title="Tables"
                          count={tables.length}
                          onRefresh={() => void refreshTables(profile.id)}
                          empty="No tables"
                        >
                          {tableGroups.map((group) => (
                            <SchemaGroup
                              key={group.schema || "default"}
                              group={group}
                              hideSchema
                              activeTable={activeTable}
                              onTable={openTable}
                            />
                          ))}
                        </TreeSection>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <div className="border-b border-[color:var(--forge-err)]/30 bg-[color:var(--forge-err)]/10 px-3 py-2 text-[12px] text-[color:var(--forge-err)]">
              {error}
            </div>
          ) : null}
          {status?.status === "connected" && explorer === "catalog" ? (
            <CatalogBrowser
              engine={active?.engine ?? "postgres"}
              items={visibleCatalog}
              current={currentDb}
              opened={openedDb}
              busy={busy}
              query={filter}
              onQuery={setFilter}
              showSystem={showSystem}
              onShowSystem={setShowSystem}
              onOpen={(name) => void openDatabase(name)}
            />
          ) : null}
          {status?.status === "connected" && explorer === "tables" ? (
            <TableBrowser
              database={openedDb}
              groups={tableGroups}
              total={tables.length}
              busy={busy}
              query={filter}
              onQuery={setFilter}
              canChangeDb={serverEngine}
              onChangeDb={showCatalog}
              onOpen={openTable}
            />
          ) : null}
          {explorer === "data" || status?.status !== "connected" ? (
            <>
              <div className="border-b border-border p-3">
                <div className="overflow-hidden rounded-xl border border-border bg-secondary focus-within:border-accent/50">
                  <textarea
                    value={sql}
                    rows={explorer === "data" ? 5 : 6}
                    spellCheck={false}
                    placeholder="Write SQL here…"
                    className="w-full resize-y bg-transparent p-3 font-mono text-[12.5px] leading-5 outline-none"
                    onChange={(e) => setSql(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        void run();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                    <span className="text-[11px] text-muted">Ctrl+Enter to run</span>
                    <div className="flex items-center gap-1">
                      {pendingMutate ? (
                        <Button size="sm" variant="danger" onClick={() => void run(true)}>
                          Confirm change
                        </Button>
                      ) : null}
                      <Button size="sm" disabled={!active || status?.status !== "connected" || busy || !sql.trim()} onClick={() => void run()}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Run
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              {columns.length ? (
                <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
                  {columns.map((col) => (
                    <span key={col.name} className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {col.name}
                      <span className="ml-1 text-foreground/70">{col.type}</span>
                      {isPrimaryKey(col) ? <span className="ml-1 text-accent">PK</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                {result ? (
                  <ResultTable
                    result={result}
                    drafts={drafts}
                    columns={columns}
                    editable={canEdit}
                    source={gridSource}
                    pkCols={pkCols}
                    dirtyCount={dirtyCount}
                    busy={busy}
                    onChange={setCell}
                    onToggleDelete={toggleDelete}
                    onAdd={addRow}
                    onDiscard={discardEdits}
                    onSave={() => void saveEdits()}
                  />
                ) : (
                  <EmptyResults connected={status?.status === "connected"} />
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {form ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90%] w-[420px] overflow-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">{form.id ? "Edit connection" : "New connection"}</div>
              <Button size="icon" variant="ghost" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DbForm value={form} onChange={setForm} onClose={() => setForm(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumb({
  connection,
  database,
  table,
  onConnection,
  onDatabase,
}: {
  connection: string;
  database: string | null;
  table: string | null;
  onConnection: () => void;
  onDatabase: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-[13px] font-medium">
      <button type="button" className="truncate hover:text-accent" onClick={onConnection}>
        {connection}
      </button>
      {database ? (
        <>
          <span className="text-muted">/</span>
          <button type="button" className="truncate hover:text-accent" onClick={onDatabase}>
            {database}
          </button>
        </>
      ) : null}
      {table ? (
        <>
          <span className="text-muted">/</span>
          <span className="truncate">{table}</span>
        </>
      ) : null}
    </div>
  );
}

function CatalogBrowser({
  engine,
  items,
  current,
  opened,
  busy,
  query,
  onQuery,
  showSystem,
  onShowSystem,
  onOpen,
}: {
  engine: DbEngine;
  items: DbCatalogInfo[];
  current: string | null;
  opened: string | null;
  busy: boolean;
  query: string;
  onQuery: (value: string) => void;
  showSystem: boolean;
  onShowSystem: (value: boolean) => void;
  onOpen: (name: string) => void;
}) {
  const { user, system } = splitCatalog(items, engine);
  const shown = showSystem ? [...user, ...system] : user;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-medium">Open a database</div>
          <p className="mt-0.5 text-[12px] text-muted">
            {items.length} database{items.length === 1 ? "" : "s"} on this server. Pick one to list its tables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {system.length ? (
            <button
              type="button"
              className="text-[11px] text-muted hover:text-foreground"
              onClick={() => onShowSystem(!showSystem)}
            >
              {showSystem ? "Hide system" : `Show ${system.length} system`}
            </button>
          ) : null}
          <div className="flex w-[220px] items-center gap-1.5 rounded-md border border-border bg-secondary px-2">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              value={query}
              placeholder="Search databases"
              className="h-8 w-full bg-transparent text-[12px] outline-none"
              onChange={(e) => onQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      {!shown.length ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted">
          {items.length ? "No databases match this filter." : "No databases found on this server."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {shown.map((item) => {
            const active = opened === item.name || item.current || current === item.name;
            return (
              <button
                key={item.name}
                type="button"
                disabled={busy}
                className={cn(
                  "group flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                  active ? "border-accent/50 bg-accent/10" : "border-border bg-card hover:border-accent/40 hover:bg-secondary",
                )}
                onClick={() => onOpen(item.name)}
              >
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-accent group-hover:bg-accent/15">
                  <Cylinder className="h-4 w-4" />
                </span>
                <span className="w-full truncate font-mono text-[13px] font-medium">{item.name}</span>
                <span className="mt-1 text-[11px] text-muted">{active && opened === item.name ? "Open" : "Open →"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TableBrowser({
  database,
  groups,
  total,
  busy,
  query,
  onQuery,
  canChangeDb,
  onChangeDb,
  onOpen,
}: {
  database: string | null;
  groups: TableGroup[];
  total: number;
  busy: boolean;
  query: string;
  onQuery: (value: string) => void;
  canChangeDb: boolean;
  onChangeDb: () => void;
  onOpen: (table: DbTableInfo) => void;
}) {
  const tables = groups.reduce((sum, group) => sum + group.tables.length, 0);
  const views = groups.reduce((sum, group) => sum + group.views.length, 0);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {canChangeDb ? (
              <Button size="sm" variant="ghost" onClick={onChangeDb}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Databases
              </Button>
            ) : null}
            <div className="text-[15px] font-medium">{database || "Tables"}</div>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {busy
              ? "Loading tables…"
              : `${tables} table${tables === 1 ? "" : "s"}${views ? ` · ${views} view${views === 1 ? "" : "s"}` : ""}${total !== tables + views ? ` · ${total} total` : ""}`}
          </p>
        </div>
        <div className="flex w-[220px] items-center gap-1.5 rounded-md border border-border bg-secondary px-2">
          <Search className="h-3.5 w-3.5 text-muted" />
          <input
            value={query}
            placeholder="Search tables"
            className="h-8 w-full bg-transparent text-[12px] outline-none"
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
      </div>
      {busy && !groups.length ? (
        <div className="flex items-center justify-center py-16 text-[12px] text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading tables…
        </div>
      ) : !groups.length ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted">
          {query.trim() ? "No tables match this filter." : "This database has no tables yet."}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.schema || "default"}>
              {group.schema ? (
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{group.schema}</div>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                {group.tables.map((table) => (
                  <TableCard key={`${table.schema ?? ""}.${table.name}`} table={table} onOpen={onOpen} />
                ))}
                {group.views.map((table) => (
                  <TableCard key={`${table.schema ?? ""}.${table.name}`} table={table} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({ table, onOpen }: { table: DbTableInfo; onOpen: (table: DbTableInfo) => void }) {
  const view = table.type === "view";
  return (
    <button
      type="button"
      className="group flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left hover:border-accent/40 hover:bg-secondary"
      onClick={() => onOpen(table)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-accent group-hover:bg-accent/15">
        {view ? <Eye className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{table.name}</span>
        <span className="text-[11px] text-muted">{view ? "View" : "Table"}</span>
      </span>
    </button>
  );
}

function DatabaseTree({
  item,
  opened,
  tables,
  activeTable,
  onOpen,
  onTable,
}: {
  item: DbCatalogInfo;
  opened: boolean;
  tables: TableGroup[];
  activeTable: string | null;
  onOpen: () => void;
  onTable: (table: DbTableInfo) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px]",
          opened ? "bg-accent/15 text-accent" : "hover:bg-secondary",
        )}
        onClick={onOpen}
      >
        {opened ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Cylinder className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="truncate">{item.name}</span>
        {opened ? <span className="ml-auto text-[9px] uppercase tracking-wide">open</span> : null}
      </button>
      {opened ? (
        <div className="ml-3 border-l border-border pl-1.5">
          {tables.length ? (
            tables.map((group) => (
              <SchemaGroup
                key={group.schema || "default"}
                group={group}
                hideSchema={tables.length === 1 && !group.schema}
                activeTable={activeTable}
                onTable={onTable}
              />
            ))
          ) : (
            <div className="px-1.5 py-1 text-[11px] text-muted">No tables</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SchemaGroup({
  group,
  hideSchema,
  activeTable,
  onTable,
}: {
  group: TableGroup;
  hideSchema?: boolean;
  activeTable: string | null;
  onTable: (table: DbTableInfo) => void;
}) {
  return (
    <div className="mb-1">
      {!hideSchema && group.schema ? (
        <div className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{group.schema}</div>
      ) : null}
      {group.tables.map((table) => (
        <TreeRow
          key={`${table.schema ?? ""}.${table.name}`}
          icon={Table2}
          label={table.name}
          active={activeTable === `${table.schema ?? ""}.${table.name}`}
          onClick={() => onTable(table)}
        />
      ))}
      {group.views.map((table) => (
        <TreeRow
          key={`${table.schema ?? ""}.${table.name}`}
          icon={Eye}
          label={table.name}
          badge="view"
          active={activeTable === `${table.schema ?? ""}.${table.name}`}
          onClick={() => onTable(table)}
        />
      ))}
    </div>
  );
}

function TreeSection({
  title,
  count,
  onRefresh,
  empty,
  children,
}: {
  title: string;
  count?: number;
  onRefresh: () => void;
  empty: string;
  children: React.ReactNode;
}) {
  const shown = count ?? (Array.isArray(children) ? children.length : children ? 1 : 0);
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-center justify-between px-1 text-[10px] uppercase tracking-wide text-muted">
        <span>
          {title}
          <span className="ml-1 normal-case tracking-normal">{shown}</span>
        </span>
        <button type="button" className="rounded p-0.5 hover:bg-secondary" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {shown ? children : <div className="px-1 py-1 text-[11px] text-muted">{empty}</div>}
    </div>
  );
}

function TreeRow({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: typeof Table2;
  label: string;
  active?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px]",
        active ? "bg-accent/15 text-accent" : "hover:bg-secondary",
      )}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto text-[9px] uppercase tracking-wide">{badge}</span> : null}
    </button>
  );
}

function ResultTable({
  result,
  drafts,
  columns,
  editable,
  source,
  pkCols,
  dirtyCount,
  busy,
  onChange,
  onToggleDelete,
  onAdd,
  onDiscard,
  onSave,
}: {
  result: DbQueryResult;
  drafts: DraftRow[];
  columns: DbColumnInfo[];
  editable: boolean;
  source: "table" | "view" | "query";
  pkCols: string[];
  dirtyCount: number;
  busy: boolean;
  onChange: (key: string, column: string, value: string) => void;
  onToggleDelete: (key: string) => void;
  onAdd: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const pkSet = new Set(pkCols);
  const headers = result.columns.length ? result.columns : columns.map((col) => col.name);
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-[11px] text-muted">
        <span className="min-w-0 truncate">
          {Math.min(result.rows.length, result.rowCount)} of {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
          {result.truncated ? " · first 500" : ""}
          {dirtyCount ? ` · ${dirtyCount} unsaved` : ""}
        </span>
        <span className="shrink-0">{result.durationMs} ms</span>
        <div className="ml-auto flex items-center gap-1">
          {editable ? (
            <>
              {!pkCols.length ? (
                <span className="mr-1 text-[10px] text-[color:var(--forge-err)]">No primary key — add rows only</span>
              ) : null}
              <Button size="sm" variant="ghost" disabled={busy} onClick={onAdd}>
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || !dirtyCount} onClick={onDiscard}>
                Discard
              </Button>
              <Button size="sm" disabled={busy || !dirtyCount} onClick={onSave}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save{dirtyCount ? ` ${dirtyCount}` : ""}
              </Button>
            </>
          ) : (
            <span>{source === "view" ? "Views are read-only" : "Open a table to edit cells"}</span>
          )}
        </div>
      </div>
      <table className="min-w-full border-collapse text-[12px]">
        <thead className="sticky top-8 bg-card">
          <tr>
            <th className="w-10 border-b border-border px-2 py-1.5 text-left text-[10px] font-medium text-muted">#</th>
            {headers.map((column) => (
              <th key={column} className="border-b border-border px-3 py-1.5 text-left font-medium">
                {column}
                {pkSet.has(column) ? <span className="ml-1 text-[10px] font-normal text-accent">PK</span> : null}
              </th>
            ))}
            {editable ? <th className="w-12 border-b border-border" /> : null}
          </tr>
        </thead>
        <tbody>
          {!drafts.length ? (
            <tr>
              <td colSpan={headers.length + (editable ? 2 : 1)} className="px-3 py-8 text-center text-[12px] text-muted">
                {editable ? "No rows yet. Click Add row to insert one." : "No rows"}
              </td>
            </tr>
          ) : null}
          {drafts.map((row, index) => {
            const inserted = row.origin === null;
            return (
              <tr
                key={row.key}
                className={cn(
                  "odd:bg-secondary/30",
                  row.deleted && "bg-[color:var(--forge-err)]/10 line-through opacity-70",
                  inserted && !row.deleted && "bg-accent/5",
                )}
              >
                <td className="px-2 py-1 text-[10px] text-muted">{inserted ? "+" : index + 1}</td>
                {headers.map((column) => {
                  const current = row.values[column];
                  const original = row.origin ? row.origin[column] : undefined;
                  const dirty = inserted || (!row.deleted && !sameValue(original ?? null, current ?? null));
                  const display = current == null ? "" : String(current);
                  const colMeta = columns.find((item) => item.name === column);
                  return (
                    <td key={column} className="max-w-[320px] px-1 py-0.5">
                      {editable && !row.deleted ? (
                        <input
                          value={display}
                          placeholder={colMeta?.nullable === false ? column : "NULL"}
                          disabled={busy}
                          className={cn(
                            "h-7 w-full min-w-[80px] rounded border bg-transparent px-2 font-mono text-[12px] outline-none",
                            dirty ? "border-accent/50 bg-accent/5" : "border-transparent hover:border-border focus:border-accent/50",
                          )}
                          onChange={(e) => onChange(row.key, column, e.target.value)}
                        />
                      ) : current == null || current === "" ? (
                        <span className="italic text-muted">NULL</span>
                      ) : (
                        <span className="block truncate px-2 font-mono" title={display}>
                          {display}
                        </span>
                      )}
                    </td>
                  );
                })}
                {editable ? (
                  <td className="px-1 py-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={busy || (!inserted && !pkCols.length)}
                      title={row.deleted ? "Undo delete" : "Delete row"}
                      onClick={() => onToggleDelete(row.key)}
                    >
                      {row.deleted ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptySidebar({ onNew }: { onNew: () => void }) {
  return (
    <div className="px-2 py-6 text-center">
      <Database className="mx-auto mb-2 h-8 w-8 text-accent/70" />
      <div className="text-[13px] font-medium">No connections</div>
      <p className="mt-1 text-[12px] leading-5 text-muted">Save PostgreSQL, MySQL, or SQLite, then connect.</p>
      <Button size="sm" className="mt-3" onClick={onNew}>
        <Plus className="h-3.5 w-3.5" />
        New connection
      </Button>
    </div>
  );
}

function EmptyResults({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-6 text-center">
      <Table2 className="mb-2 h-8 w-8 text-muted" />
      <div className="text-[13px] font-medium">{connected ? "Run a query" : "Connect to a server"}</div>
      <p className="mt-1 max-w-[280px] text-[12px] leading-5 text-muted">
        {connected
          ? "Open a database to browse tables, or write SQL and press Run."
          : "Select a saved connection and click Connect. Leave the database field empty to list every database on the server."}
      </p>
    </div>
  );
}

function DbForm({
  value,
  onChange,
  onClose,
}: {
  value: DbProfileInput;
  onChange: (next: DbProfileInput) => void;
  onClose: () => void;
}) {
  function patch(partial: Partial<DbProfileInput>) {
    onChange({ ...value, ...partial });
  }
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-muted">Engine</label>
      <select
        value={value.engine}
        onChange={(e) => {
          const engine = e.target.value as DbEngine;
          patch({ engine, port: engine === "postgres" ? 5432 : engine === "mysql" ? 3306 : undefined });
        }}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
      >
        <option value="postgres">PostgreSQL</option>
        <option value="mysql">MySQL</option>
        <option value="sqlite">SQLite</option>
      </select>
      <Field label="Name" value={value.name} onChange={(name) => patch({ name })} placeholder="Production" />
      {value.engine === "sqlite" ? (
        <div className="mt-3">
          <div className="truncate font-mono text-[11px] text-muted">{value.filePath || "No file selected"}</div>
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => void window.forge.dbPickSqlite().then((filePath) => filePath && patch({ filePath }))}
          >
            Choose .db file
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="Host" value={value.host ?? ""} onChange={(host) => patch({ host })} />
            </div>
            <Field label="Port" value={String(value.port ?? "")} onChange={(port) => patch({ port: Number(port) || undefined })} />
          </div>
          <Field label="Username" value={value.username ?? ""} onChange={(username) => patch({ username })} />
          <Field
            label="Password"
            value={value.secret ?? ""}
            type="password"
            placeholder={value.id ? "Leave blank to keep saved password" : ""}
            onChange={(secret) => patch({ secret })}
          />
          <Field
            label="Database"
            value={value.database ?? ""}
            placeholder="Optional — list all after connect"
            onChange={(database) => patch({ database })}
          />
          <label className="mt-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={Boolean(value.ssl)} onChange={(e) => patch({ ssl: e.target.checked })} />
            Use SSL
          </label>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={value.engine === "sqlite" ? !value.filePath : !value.host}
          onClick={() => void window.forge.dbSave(value).then(onClose)}
        >
          Save connection
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function toForm(profile: DbProfile): DbProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    engine: profile.engine,
    host: profile.host ?? "127.0.0.1",
    port: profile.port,
    username: profile.username ?? "",
    database: profile.database ?? "",
    filePath: profile.filePath ?? "",
    ssl: profile.ssl,
    secret: "",
  };
}

function summary(profile: DbProfile): string {
  if (profile.engine === "sqlite") return profile.filePath || "sqlite";
  return `${profile.username ?? "user"}@${profile.host ?? "host"}:${profile.port ?? ""}`;
}

function engineLabel(engine: DbEngine): string {
  if (engine === "postgres") return "PostgreSQL";
  if (engine === "mysql") return "MySQL";
  return "SQLite";
}

function statusChip(status?: string) {
  if (status === "connected") return "border-[color:var(--forge-ok)]/40 bg-[color:var(--forge-ok)]/10 text-[color:var(--forge-ok)]";
  if (status === "connecting") return "border-accent/40 bg-accent/10 text-accent";
  if (status === "error") return "border-[color:var(--forge-err)]/40 bg-[color:var(--forge-err)]/10 text-[color:var(--forge-err)]";
  return "border-border bg-secondary text-muted";
}

function dot(status?: string) {
  if (status === "connected") return "bg-[color:var(--forge-ok)]";
  if (status === "connecting") return "animate-pulse bg-accent";
  if (status === "error") return "bg-[color:var(--forge-err)]";
  return "bg-muted";
}

function isPrimaryKey(col: DbColumnInfo): boolean {
  return Boolean(col.key && /^(pk|pri)$/i.test(col.key));
}

function sameValue(a: DbRowValue, b: DbRowValue): boolean {
  if (a == null && (b == null || b === "")) return true;
  if (b == null && (a == null || a === "")) return true;
  return String(a) === String(b);
}

function countDirty(drafts: DraftRow[], columns: string[]): number {
  return drafts.filter((row) => {
    if (row.origin === null) {
      if (row.deleted) return false;
      return columns.some((column) => {
        const value = row.values[column];
        return value !== "" && value != null;
      });
    }
    if (row.deleted) return true;
    return columns.some((column) => !sameValue(row.origin![column] ?? null, row.values[column] ?? null));
  }).length;
}

function buildOps(table: DbTableInfo, columns: DbColumnInfo[], drafts: DraftRow[], pkCols: string[]): DbEditOp[] {
  const names = columns.length ? columns.map((col) => col.name) : Object.keys(drafts[0]?.values ?? {});
  const ops: DbEditOp[] = [];
  for (const draft of drafts) {
    if (draft.origin === null) {
      if (draft.deleted) continue;
      const values: Record<string, DbRowValue> = {};
      for (const name of names) {
        const value = draft.values[name];
        if (value === "" || value == null) continue;
        values[name] = value;
      }
      if (Object.keys(values).length) {
        ops.push({ kind: "insert", table: table.name, schema: table.schema, values });
      }
      continue;
    }
    const origin = draft.origin;
    if (draft.deleted) {
      if (!pkCols.length) throw new Error("Cannot delete a row without a primary key.");
      ops.push({
        kind: "delete",
        table: table.name,
        schema: table.schema,
        where: Object.fromEntries(pkCols.map((name) => [name, origin[name] ?? null])),
      });
      continue;
    }
    const values: Record<string, DbRowValue> = {};
    for (const name of names) {
      if (!sameValue(origin[name] ?? null, draft.values[name] ?? null)) {
        values[name] = draft.values[name] === "" ? null : (draft.values[name] ?? null);
      }
    }
    if (!Object.keys(values).length) continue;
    if (!pkCols.length) throw new Error("Cannot update a row without a primary key.");
    ops.push({
      kind: "update",
      table: table.name,
      schema: table.schema,
      where: Object.fromEntries(pkCols.map((name) => [name, origin[name] ?? null])),
      values,
    });
  }
  return ops;
}

type TableGroup = {
  schema: string;
  tables: DbTableInfo[];
  views: DbTableInfo[];
};

function groupTables(items: DbTableInfo[]): TableGroup[] {
  const map = new Map<string, TableGroup>();
  for (const item of items) {
    const schema = item.schema || "";
    const group = map.get(schema) ?? { schema, tables: [], views: [] };
    if (item.type === "view") group.views.push(item);
    else group.tables.push(item);
    map.set(schema, group);
  }
  return [...map.values()];
}

const SYSTEM_DBS: Record<DbEngine, string[]> = {
  postgres: ["postgres", "template0", "template1"],
  mysql: ["mysql", "information_schema", "performance_schema", "sys"],
  sqlite: [],
};

function splitCatalog(items: DbCatalogInfo[], engine: DbEngine): { user: DbCatalogInfo[]; system: DbCatalogInfo[] } {
  const systemNames = new Set(SYSTEM_DBS[engine]);
  const user: DbCatalogInfo[] = [];
  const system: DbCatalogInfo[] = [];
  for (const item of items) {
    if (systemNames.has(item.name)) system.push(item);
    else user.push(item);
  }
  return { user, system };
}
