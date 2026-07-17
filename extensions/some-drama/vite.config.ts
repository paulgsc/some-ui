import { extensionConfig } from "@some-extension/common/vite"

// Single source of truth for both `pnpm dev` and `pnpm build`. One `vite build`
// emits every entry; the classic entries (content + background) are flattened
// into self-contained IIFEs so they load as classic scripts, the popup is a
// module page and keeps its chunks, and the two UnoCSS stylesheets are emitted
// as part of the same build.
export default extensionConfig({
  alias: { "@drama": "src" },
  entries: [
    { name: "content", input: "src/content/content.ts" },
    { name: "background", input: "src/background/background.ts" },
    { name: "popup", input: "popup.html", classic: false },
  ],
  unocss: [
    {
      // Content-script CSS: no preflights (the host page owns the reset).
      config: "uno.config.ts",
      out: "dist/styles/content.css",
      preflights: false,
      patterns: [
        "src/**/*.{ts,tsx}",
        "src/styles/tokens/tokens.css",
        "src/styles/components/root-layout.css",
        "src/styles/components/title-pill.css",
        "src/styles/components/card-shell.css",
        "src/styles/components/slideshow.css",
        "src/styles/components/right-panel.css",
        "src/styles/components/capture-panel.css",
        "src/styles/components/particles.css",
      ],
    },
    {
      // Popup CSS: preflights on (the popup page is ours).
      config: "uno.config.popup.ts",
      out: "dist/popup.css",
      patterns: [
        "src/**/*.{ts,tsx}",
        "src/styles/tokens/tokens.css",
        "src/styles/components/popup/popup-base.css",
        "src/styles/components/popup/form-structural/popup-form-structural.css",
        "src/styles/components/popup/form-opinionated/opinionated-form.css",
        "src/styles/components/popup/form-opinionated/accordion.css",
        "src/styles/components/popup/form-opinionated/episode-header.css",
        "src/styles/components/popup/form-opinionated/moment-tags.css",
        "src/styles/components/popup/form-opinionated/transition-editor.css",
        "src/styles/components/popup/form-opinionated/reflection-editor.css",
        "src/styles/components/popup/form-opinionated/quote-capture.css",
        "src/styles/components/popup/form-opinionated/preview-card.css",
        "src/styles/components/popup/form-opinionated/advanced-metrics.css",
      ],
    },
  ],
})
