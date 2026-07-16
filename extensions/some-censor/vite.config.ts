import { extensionConfig } from "@some-extension/common/vite"
import type { UserConfig } from "vite"

// Platform split: content/background import `@censor/platform/*`, aliased to the
// Firefox or Chrome implementation per build target.
const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@censor/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@censor/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@censor": "src",
})

const entries = [
  { name: "content", input: "src/content/content.ts" },
  { name: "background", input: "src/background/background.ts" },
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
    copy: chromium
      ? []
      : [{ from: "public/manifest.firefox.json", to: "manifest.json" }],
  })
}

export default config
