import type { BuildContext } from "@some-extension/common/build"

const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@censor/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@censor/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@censor": "src",
})

// Classic contexts (content script + MV3 non-module background) — IIFE.
const entries: BuildContext[string]["entries"] = [
  { name: "content", input: "src/content/content.ts", format: "iife" },
  { name: "background", input: "src/background/background.ts", format: "iife" },
]

const context: BuildContext = {
  // public/manifest.json (MV3, chromium) is copied as-is by Vite's default
  // public-dir copy — no explicit copy step needed.
  chromium: {
    alias: platformAlias("chrome"),
    entries,
  },
  // public/ also contains manifest.json (chromium), so the default public-dir
  // copy puts the WRONG manifest at dist/manifest.json; overwrite it with the
  // Firefox one after all entries build.
  firefox: {
    alias: platformAlias("firefox"),
    entries,
    copy: [{ from: "public/manifest.firefox.json", to: "manifest.json" }],
  },
}

export default context
