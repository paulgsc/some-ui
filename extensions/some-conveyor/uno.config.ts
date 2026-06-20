import { defineSomeUiConfig } from "@some-ui/styles/config"

/**
 * UnoCSS config for the `some-conveyor` extension.
 *
 * some-conveyor is a *content-script* surface: its UI lives inside a closed
 * shadow root injected into arbitrary host pages (see `lib/content/shadow-host.ts`).
 * Two consequences shape this config:
 *
 *   1. `preflight: false` — unlike a self-contained popup/options page, a global
 *      reset is undesirable here. The shadow root already isolates us from the
 *      page, and the authored geometry CSS is deliberately reset-free; shipping
 *      preflight would only risk perturbing the carefully-tuned cube layout.
 *
 *   2. The stylesheet is consumed as a single linked sheet inside the shadow
 *      root, so `@apply` (via `transformerDirectives`, enabled by
 *      `defineSomeUiConfig`) is the ergonomic seam: the authored
 *      `src/styles/conveyor.css` leans on preset utilities at dev time and the
 *      CLI compiles them to plain static CSS at build time — no engine ships.
 *
 * Runtime colors stay on the ThemeEngine custom-property contract
 * (`--face-bg`, `--strip-bg`, …); those are the extension's live theming knobs,
 * not dead bespoke tokens, so they are intentionally preserved.
 */
export default defineSomeUiConfig(
  { preflight: false },
  {
    content: {
      filesystem: ["src/**/*.{ts,tsx,html}", "src/styles/*.css"],
    },
  }
)
