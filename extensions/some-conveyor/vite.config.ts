import { extensionConfig } from "@some-extension/common/vite"
import type { UserConfig } from "vite"

// Platform split: content/background import `@conveyor/platform/*`, aliased to
// the Firefox or Chrome implementation per build target.
const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@conveyor/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@conveyor/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@conveyor": "src",
})

const entries = [
  { name: "content", input: "src/content/content.ts" },
  { name: "background", input: "src/background/background.ts" },
]

// @some-ui/polyhedron is a wasm-bindgen crate built separately
// (crates/polyhedron). Its dist/ doesn't exist at tsc/vite time; the runtime
// import is a `@vite-ignore`d chrome.runtime.getURL(...), so externalizing the
// bare specifier is safe. Its build output is copied into dist/polyhedron.
const external = ["@some-ui/polyhedron"]
const polyhedronCopy = {
  from: "../../crates/polyhedron/dist",
  to: "polyhedron",
}

const unocss = [
  {
    // Content-script shadow-tree CSS: no preflights (a global reset would leak
    // into host pages). See uno.config.ts for the scanning rationale.
    config: "uno.config.ts",
    out: "dist/styles/conveyor.css",
    preflights: false,
    patterns: ["src/**/*.{ts,tsx}", "src/styles/conveyor.css"],
  },
]

// One `vite build` per target. `--mode chromium` builds Chrome; the default
// (production) target is Firefox, matching the prior `build = build:firefox`.
// public/manifest.json is the chromium manifest (Vite's public-dir copy lands
// it at dist/manifest.json); the Firefox build overwrites it afterwards.
const config = ({ mode }: { mode: string }): UserConfig => {
  const chromium = mode === "chromium"
  return extensionConfig({
    alias: platformAlias(chromium ? "chrome" : "firefox"),
    entries,
    external,
    unocss,
    copy: chromium
      ? [polyhedronCopy]
      : [
          { from: "public/firefox-v3-manifest.json", to: "manifest.json" },
          polyhedronCopy,
        ],
  })
}

export default config
