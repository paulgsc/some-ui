import { extensionConfig } from "@some-extension/common/vite"

// Single source of truth for `pnpm build` (Firefox MV3). One `vite build`
// emits every entry; the classic entries (the worker service worker and the
// two content scripts) are flattened into self-contained IIFEs, while the
// popup page keeps its ESM. Firefox is the only distribution target, so there
// is no per-mode branch.
//
// public/manifest.firefox.json is copied into dist/ as manifest.json after the
// bundle (Vite's public-dir copy also lands it at dist/manifest.firefox.json).
export default extensionConfig({
  alias: {
    "@suspender/platform": "src/lib/platform/firefox.ts",
    "@suspender": "src",
  },
  entries: [
    { name: "worker", input: "src/worker/worker.ts" },
    { name: "watch", input: "src/content/watch.ts" },
    { name: "resume-veil", input: "src/content/resume-veil.ts" },
    { name: "popup", input: "popup.html", classic: false },
    { name: "debug", input: "debug.html", classic: false },
  ],
  copy: [{ from: "public/manifest.firefox.json", to: "manifest.json" }],
})
