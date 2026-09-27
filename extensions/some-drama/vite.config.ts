import { extensionConfig } from "@some-extension/common/vite"

import { CONTENT_SOURCES, POPUP_SOURCES } from "./uno.sources"

// Single source of truth for both `pnpm dev` and `pnpm build`. One `vite build`
// emits every entry; the classic entries (content + background) are flattened
// into self-contained IIFEs so they load as classic scripts, the popup is a
// module page and keeps its chunks, and the two UnoCSS stylesheets are emitted
// as part of the same build. What each stylesheet scans lives in uno.sources.ts.
export default extensionConfig({
  alias: { "@drama": "src" },
  entries: [
    { name: "content", input: "src/content/content.ts" },
    { name: "background", input: "src/background/background.ts" },
    { name: "popup", input: "popup.html", classic: false },
  ],
  brandIcons: true,
  unocss: [
    {
      // Content-script CSS: no preflights (the host page owns the reset).
      config: "uno.config.ts",
      out: "dist/styles/content.css",
      preflights: false,
      patterns: CONTENT_SOURCES,
    },
    {
      // Popup CSS: preflights on (the popup page is ours).
      config: "uno.config.popup.ts",
      out: "dist/popup.css",
      patterns: POPUP_SOURCES,
    },
  ],
})
