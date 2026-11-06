// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Starts the local dataset tool beside the dev server. Never part of a build; skipped quietly without Python. */
function datasetTool() {
  return {
    name: "local-dataset-tool",
    apply: "serve" as const,
    configureServer(server: { httpServer?: { once(e: string, f: () => void): void } | null }) {
      if (process.env.LOVABLE_SANDBOX || process.env.DEV_SERVER__PROJECT_PATH || !existsSync("scripts/dataset_wizard.py")) return;
      const start = (cmd: string, fallback?: string) => {
        const p: ChildProcess = spawn(cmd, ["scripts/dataset_wizard.py"], { stdio: "ignore", windowsHide: true });
        p.on("error", () => { if (fallback) start(fallback); });
        server.httpServer?.once("close", () => p.kill());
      };
      start("python", "python3");
    },
  };
}

export default defineConfig({
  plugins: [datasetTool()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Pre-bundle the slider up front so the preview never re-optimizes it mid-session
  // (that produced a second React copy and a blank screen).
  vite: { optimizeDeps: { include: ["@radix-ui/react-slider", "@radix-ui/react-dialog"] } },
});
