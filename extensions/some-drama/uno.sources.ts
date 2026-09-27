/**
 * What each of the two UnoCSS stylesheets is generated from — declared once,
 * read by `vite.config.ts` (the build) and by `uno.config*.ts` (editor tooling),
 * so the two cannot drift apart.
 *
 * Each list is scoped to the modules that actually render into that surface.
 * Scanning all of `src` for both sheets harvested every bare word in the other
 * surface's source (and in the stories): `el("input")` in the popup form, or
 * "badge" in a comment, became `.input` / `.badge` shortcuts in the content
 * sheet, reading `--input`, `--ring` and `--border` — tokens a preflight-less
 * sheet injected into `<all_urls>` never defines. The TS globs are `*.ts`, not
 * `*.{ts,tsx}`: every story is a `.tsx`, so they stay out of the scan.
 *
 * Order matters: UnoCSS concatenates raw `.css` inputs in list order ahead of
 * the generated utilities, so tokens come first and components follow.
 */

/** Content-script overlay: the DramaCard and everything it composes. */
export const CONTENT_SOURCES: Array<string> = [
  "src/content/**/*.ts",
  "src/effects/content/**/*.ts",
  "src/logic/content/**/*.ts",
  "src/components/{drama-card,slideshow,right-panel,capture-panel,drag-controller,live-strip,spotlight}/*.ts",
  "src/styles/tokens/tokens.css",
  "src/styles/tokens/theme.css",
  "src/styles/components/root-layout.css",
  "src/styles/components/title-pill.css",
  "src/styles/components/card-shell.css",
  "src/styles/components/slideshow.css",
  "src/styles/components/right-panel.css",
  "src/styles/components/capture-panel.css",
  "src/styles/components/live-strip.css",
  "src/styles/components/spotlight.css",
  "src/styles/components/particles.css",
]

/** Browser-action popup: the watchlist, and the Facts / Feels entry form. */
export const POPUP_SOURCES: Array<string> = [
  "popup.html",
  "src/popup/**/*.ts",
  "src/effects/popup/**/*.ts",
  "src/logic/popup/**/*.ts",
  "src/components/{popup-renderer,form-structural}/*.ts",
  "src/components/form-opinionated/**/*.ts",
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
]
