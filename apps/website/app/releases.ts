export const release = {
  version: "0.3.0",
  channel: "Beta",
  releasedAt: "August 13, 2026",
  downloads: {
    windows: { label: "Windows", detail: "Windows 10 or later · 64-bit", filename: "Forge-Setup-0.3.0.exe", href: "https://github.com/vathanakkongsothy/forge/releases/download/v0.3.0/Forge-Setup-0.3.0.exe", available: true },
    macos: { label: "macOS", detail: "Universal (Apple silicon & Intel) · DMG · Built on release tags", filename: "Forge-0.3.0.dmg", href: "https://github.com/vathanakkongsothy/forge/releases/latest", available: false },
    linux: { label: "Linux", detail: "AppImage & deb · x64 · Built on release tags", filename: "Forge-0.3.0.AppImage", href: "https://github.com/vathanakkongsothy/forge/releases/latest", available: false },
  },
} as const;

export const changelog = [
  { version: "0.3.0", date: "August 13, 2026", channel: "Beta", groups: [
    { title: "New", items: ["Database workspace for SQLite, PostgreSQL, and MySQL", "Saved SSH profiles and integrated remote terminals", "Persistent light and dark themes"] },
    { title: "Improved", items: ["Browser sessions and inspector context", "Clickable links and file references in agent responses", "Terminal tabs and tool activity feedback"] },
    { title: "Fixed", items: ["Browser preview persistence when switching workspace tabs", "Theme consistency across editor, terminal, and status colors"] },
  ] },
  { version: "0.2.0", date: "August 13, 2026", channel: "Beta", groups: [
    { title: "New", items: ["Embedded browser workspace", "Built-in DOM inspector", "Windows installer"] },
    { title: "Improved", items: ["Faster project switching", "Clearer tool activity timeline", "Safer command approvals"] },
    { title: "Fixed", items: ["Terminal reconnection after project changes", "Browser preview sizing"] },
  ] },
  { version: "0.1.0", date: "August 5, 2026", channel: "Beta", groups: [
    { title: "New", items: ["First public Forge beta", "Grok-powered coding agent", "Editor, terminal, Git, and project explorer"] },
  ] },
] as const;
