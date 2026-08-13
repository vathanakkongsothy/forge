# Forge

**Ask → Code → Run → See → Inspect → Fix → Verify → Commit**

Forge is a Codex-like coding workspace. The desktop shell is **Electron**.

```bash
cd Forge
npm install
npm run dev
```

Sign in with Grok in Settings (same SuperGrok / X Premium+ OAuth as Grok Build CLI). Forge reuses `~/.grok/auth.json` if you already ran `grok login`. An `XAI_API_KEY` from [console.x.ai](https://console.x.ai) still works as a fallback.

## Architecture

```text
UI (React)
  ↓ Electron IPC
Desktop Runtime (src/main)
  ↓
Agent Core → Tools → Files / Git / Terminal / Browser
```

The renderer never gets unrestricted filesystem access.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Electron window |
| `npm run build` | Production Electron bundles |
| `npm run dist` | Windows installer (`release/Forge-Setup-*.exe`) |
| `npm run typecheck` | TypeScript |
