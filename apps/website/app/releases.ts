export const release = {
  version: "0.2.0",
  channel: "Beta",
  releasedAt: "August 13, 2026",
  downloads: {
    windows: { label: "Windows", detail: "Windows 10 or later · 64-bit", filename: "Forge-Setup-0.2.0.exe", href: "https://github.com/vathanakkongsothy/forge/releases/download/v0.2.0/Forge-Setup-0.2.0.exe", available: true },
    macos: { label: "macOS", detail: "Apple silicon & Intel · Coming soon", filename: "Forge-0.2.0.dmg", href: "#", available: false },
    linux: { label: "Linux", detail: "AppImage · Coming soon", filename: "Forge-0.2.0.AppImage", href: "#", available: false },
  },
} as const;

export const changelog = [
  { version: "0.2.0", date: "August 13, 2026", channel: "Beta", groups: [
    { title: "New", items: ["Embedded browser workspace", "Built-in DOM inspector", "Windows installer"] },
    { title: "Improved", items: ["Faster project switching", "Clearer tool activity timeline", "Safer command approvals"] },
    { title: "Fixed", items: ["Terminal reconnection after project changes", "Browser preview sizing"] },
  ] },
  { version: "0.1.0", date: "August 5, 2026", channel: "Beta", groups: [
    { title: "New", items: ["First public Forge beta", "Grok-powered coding agent", "Editor, terminal, Git, and project explorer"] },
  ] },
] as const;
