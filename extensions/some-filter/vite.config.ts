import { extensionConfig } from "@some-extension/common/vite"
import type { UserConfig } from "vite"

// Platform split: content/background import `@filter/platform/*`, aliased to the
// Firefox or Chrome implementation per build target.
const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@filter/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@filter/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@filter": "src",
})

const entries = [
  { name: "content", input: "src/content/content.ts" },
  { name: "background", input: "src/background/background.ts" },
  { name: "popup", input: "popup.html", classic: false },
]

// One `vite build` per target. `--mode chromium` builds Chrome; the default
// (production) target is Firefox, matching the prior `build = build:firefox`.
// public/manifest.json is the chromium manifest (Vite's public-dir copy lands
// it at dist/manifest.json); the Firefox build overwrites it afterwards.
// public/prepaint.css and public/prepaint-start.js (the document_start
// prepaint content script) ride along via the same public-dir copy.
const config = ({ mode }: { mode: string }): UserConfig => {
  const chromium = mode === "chromium"
  return extensionConfig({
    alias: platformAlias(chromium ? "chrome" : "firefox"),
    entries,
    copy: chromium
      ? []
      : [{ from: "public/manifest.firefox.json", to: "manifest.json" }],
  })
}

export default config
