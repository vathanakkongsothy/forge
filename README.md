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
| `npm run dist` | Windows installer (`release/Forge-Setup-*.exe`) — unchanged default |
| `npm run dist:win` | Same as `dist` — Windows NSIS installer (x64) |
| `npm run dist:mac` | macOS universal DMG + ZIP (`release/Forge-*.dmg`, `release/Forge-*.zip`) |
| `npm run dist:linux` | Linux AppImage + deb (`release/Forge-*.AppImage`, `release/Forge-*.deb`) |
| `npm run typecheck` | TypeScript |

## Desktop downloads

| Platform | Artifact | Status |
|---|---|---|
| Windows | `Forge-Setup-<version>.exe` | Available ([latest release](https://github.com/vathanakkongsothy/forge/releases/latest)) |
| macOS | `Forge-<version>.dmg` (universal) + `.zip` | Built unsigned on `macos-latest` CI; attach to GitHub Releases on tag |
| Linux | `Forge-<version>.AppImage` + `.deb` (x64) | Built on `ubuntu-latest` CI; attach to GitHub Releases on tag |

The [phu-mi.com download page](https://phu-mi.com/download) links to GitHub Releases. **v0.3.0** ships Windows only; macOS and Linux packages are produced by CI starting with the next tagged release (`v*`).

### Build locally

Run platform-specific scripts on the matching OS:

```bash
npm run dist:win    # Windows
npm run dist:mac    # macOS (requires macOS host or CI)
npm run dist:linux  # Linux (x64)
```

Configuration lives in [`electron-builder.yml`](electron-builder.yml). Icons are in [`build/icon.png`](build/icon.png).

### macOS code signing (optional)

CI builds are **unsigned/ad-hoc** (`CSC_IDENTITY_AUTO_DISCOVERY=false`) so beta users can install via right-click → Open. For signed and notarized distribution:

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Import a **Developer ID Application** certificate into the macOS keychain on the build machine.
3. Set GitHub Actions secrets: `CSC_LINK` (base64 `.p12`), `CSC_KEY_PASSWORD`, and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization.
4. Remove or override `CSC_IDENTITY_AUTO_DISCOVERY=false` in [`.github/workflows/release-build.yml`](.github/workflows/release-build.yml) and enable `hardenedRuntime` + entitlements in `electron-builder.yml` as needed.

### CI

- **Release build** (`.github/workflows/release-build.yml`): on `v*` tags, builds Windows, macOS, and Linux in parallel, then publishes all artifacts to a GitHub Release (marked prerelease).
- **Linux PR check** (`.github/workflows/build-linux.yml`): validates Linux packaging on pull requests.

The website (`apps/website`) is deployed separately and is not affected by desktop build scripts.
