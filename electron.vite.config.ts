import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const forge = {
  "@forge/shared": resolve("packages/shared/src/index.ts"),
  "@forge/database": resolve("packages/database/src/index.ts"),
  "@forge/git": resolve("packages/git/src/index.ts"),
  "@forge/terminal": resolve("packages/terminal/src/index.ts"),
  "@forge/browser": resolve("packages/browser/src/index.ts"),
  "@forge/tools": resolve("packages/tools/src/index.ts"),
  "@forge/agent-core": resolve("packages/agent-core/src/index.ts"),
  "@forge/oauth": resolve("packages/oauth/src/index.ts"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: Object.keys(forge) })],
    resolve: { alias: forge },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: Object.keys(forge) })],
    resolve: { alias: forge },
  },
  renderer: {
    resolve: {
      alias: {
        ...forge,
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    optimizeDeps: {
      exclude: ["monaco-editor", "@monaco-editor/react"],
    },
  },
});
