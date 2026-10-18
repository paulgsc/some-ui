import { extensionConfig } from "@some-extension/common/vite"

// Platform split: content/background import `@censor/platform/*`, aliased to the
// Firefox or Chrome implementation per build target.
const platformAlias = (
  variant: "firefox" | "chrome"
): Record<string, string> => ({
  "@censor/platform/content": `src/lib/platform/content/api.${variant}.ts`,
  "@censor/platform/background": `src/lib/platform/background/api.${variant}.ts`,
  "@censor": "src",
})

// The diagnostics page (OBS2) is its own standalone extension page, reachable
// at its own moz-extension:// / chrome-extension:// URL, as in
// suspender-ledger and some-filter.
const entries = [
  { name: "content", input: "src/content/content.ts" },
  { name: "background", input: "src/background/background.ts" },
  { name: "debug", input: "debug.html", classic: false },
  { name: "popup", input: "popup.html", classic: false },
]

// The content stylesheet is a standalone file the manifest references
// (`"css": ["styles/content.css"]`), not a JS-injected style, so it is copied
// as written rather than going through Vite's CSS graph.
const contentCss = { from: "src/styles/content.css", to: "styles/content.css" }

// One `vite build` per target. `--mode chromium` builds Chrome; the default
// (production) target is Firefox, matching the prior `build = build:firefox`.
// public/manifest.json is the chromium manifest (Vite's public-dir copy lands
// it at dist/manifest.json); the Firefox build overwrites it afterwards.
const config = ({
  mode,
}: {
  mode: string
}): ReturnType<typeof extensionConfig> => {
  const chromium = mode === "chromium"
  return extensionConfig({
    alias: platformAlias(chromium ? "chrome" : "firefox"),
    entries,
    brandIcons: true,
    copy: chromium
      ? [contentCss]
      : [
          contentCss,
          { from: "public/manifest.firefox.json", to: "manifest.json" },
        ],
  })
}

export default config
