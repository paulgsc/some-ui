import type { BuildContext } from "@some-extension/common/build"

const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@conveyor/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@conveyor/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@conveyor": "src",
})

// Classic contexts (content script + MV3 non-module background) — IIFE.
const entries: BuildContext[string]["entries"] = [
  { name: "content", input: "src/content/content.ts", format: "iife" },
  { name: "background", input: "src/background/background.ts", format: "iife" },
]

// @some-ui/polyhedron is a wasm-bindgen crate built separately
// (crates/polyhedron). Its dist/ doesn't exist at tsc/vite time; the runtime
// import is already guarded with a .catch in WasmBridge, so externalizing
// here is safe. Its build output is copied into dist/polyhedron below.
const external = ["@some-ui/polyhedron"]
const polyhedronCopy = {
  from: "../../crates/polyhedron/dist",
  to: "polyhedron",
}

const context: BuildContext = {
  // public/manifest.json (MV3, chromium) is copied as-is by Vite's default
  // public-dir copy — no explicit manifest copy step needed.
  chromium: {
    alias: platformAlias("chrome"),
    entries,
    external,
    copy: [polyhedronCopy],
  },
  // public/ also contains manifest.json (chromium), so the default public-dir
  // copy puts the WRONG manifest at dist/manifest.json; overwrite it with the
  // Firefox one after all entries build.
  firefox: {
    alias: platformAlias("firefox"),
    entries,
    external,
    copy: [
      { from: "public/firefox-v3-manifest.json", to: "manifest.json" },
      polyhedronCopy,
    ],
  },
}

export default context
