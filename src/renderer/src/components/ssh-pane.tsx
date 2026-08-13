import { useMemo, useState } from "react";
import { Cable, Pencil, Plus, Trash2 } from "lucide-react";
import type { AppState, SshAuthMethod, SshProfile, SshProfileInput } from "@forge/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const emptyForm: SshProfileInput = {
  name: "",
  host: "",
  port: 22,
  username: "",
  auth: "password",
  keyPath: "",
  secret: "",
};

export function SshPane({ state }: { state: AppState }) {
  const [form, setForm] = useState<SshProfileInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connections = useMemo(
    () => new Map((state.sshConnections ?? []).map((item) => [item.profileId, item])),
    [state.sshConnections],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">Saved sessions</span>
        <Button size="sm" variant="ghost" onClick={() => { setError(null); setForm({ ...emptyForm }); }}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!(state.sshProfiles ?? []).length && !form ? (
          <p className="px-1 text-xs leading-5 text-muted">
            Save an SSH session, then Connect to open a remote shell in the terminal.
          </p>
        ) : null}
        {(state.sshProfiles ?? []).map((profile) => {
          const link = connections.get(profile.id);
          return (
            <div key={profile.id} className="mb-2 rounded-lg border border-border bg-card p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{profile.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted">
                    {profile.username}@{profile.host}:{profile.port}
                  </div>
                  <div className={cn("mt-1 text-[10px] uppercase tracking-wide", statusClass(link?.status))}>
                    {link?.status ?? "disconnected"}
                    {link?.error ? ` · ${link.error}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setForm(toForm(profile))}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-2 flex gap-1">
                {link?.status === "connected" || link?.status === "connecting" ? (
                  <Button size="sm" variant="outline" onClick={() => void window.forge.sshDisconnect(profile.id)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setError(null);
                      void window.forge.sshConnect(profile.id).catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : String(err));
                      });
                    }}
                  >
                    <Cable className="h-3 w-3" />
                    Connect
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void window.forge.sshDelete(profile.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
        {form ? <SshForm value={form} error={error} onChange={setForm} onClose={() => setForm(null)} /> : null}
      </div>
    </div>
  );
}

function SshForm({
  value,
  error,
  onChange,
  onClose,
}: {
  value: SshProfileInput;
  error: string | null;
  onChange: (next: SshProfileInput) => void;
  onClose: () => void;
}) {
  function patch(partial: Partial<SshProfileInput>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="rounded-lg border border-border bg-secondary p-2">
      <div className="mb-2 text-[11px] font-medium">{value.id ? "Edit session" : "New session"}</div>
      <Field label="Name" value={value.name} placeholder="Production" onChange={(name) => patch({ name })} />
      <Field label="Host" value={value.host} placeholder="192.168.1.10" onChange={(host) => patch({ host })} />
      <Field label="Port" value={String(value.port)} onChange={(port) => patch({ port: Number(port) || 22 })} />
      <Field label="Username" value={value.username} placeholder="root" onChange={(username) => patch({ username })} />
      <label className="mt-2 block text-[10px] uppercase tracking-wide text-muted">Auth</label>
      <select
        value={value.auth}
        onChange={(e) => patch({ auth: e.target.value as SshAuthMethod })}
        className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      >
        <option value="password">Password</option>
        <option value="key">Private key</option>
        <option value="agent">SSH agent</option>
      </select>
      {value.auth === "key" ? (
        <div className="mt-2">
          <div className="truncate font-mono text-[10px] text-muted">{value.keyPath || "No key selected"}</div>
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => void window.forge.sshPickKey().then((keyPath) => keyPath && patch({ keyPath }))}
          >
            Choose key
          </Button>
        </div>
      ) : null}
      {value.auth !== "agent" ? (
        <Field
          label={value.auth === "key" ? "Key passphrase (optional)" : "Password"}
          value={value.secret ?? ""}
          type="password"
          placeholder={value.id ? "Leave blank to keep saved secret" : ""}
          onChange={(secret) => patch({ secret })}
        />
      ) : null}
      {error ? <p className="mt-2 text-[11px] text-[color:var(--forge-err)]">{error}</p> : null}
      <div className="mt-2 flex gap-1">
        <Button
          size="sm"
          disabled={!value.host.trim() || !value.username.trim()}
          onClick={() => {
            void window.forge.sshSave(value).then(onClose);
          }}
        >
          Save session
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
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
    <label className="mt-2 block">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      />
    </label>
  );
}

function toForm(profile: SshProfile): SshProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    auth: profile.auth,
    keyPath: profile.keyPath ?? "",
    secret: "",
  };
}

function statusClass(status?: string) {
  if (status === "connected") return "text-[color:var(--forge-ok)]";
  if (status === "connecting") return "text-accent";
  if (status === "error") return "text-[color:var(--forge-err)]";
  return "text-muted";
}
