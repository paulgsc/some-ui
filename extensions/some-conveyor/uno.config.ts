import { defineSomeUiConfig } from "@some-ui/styles/config"

/**
 * UnoCSS config for the `some-conveyor` extension.
 *
 * some-conveyor is a content-script surface: its UI lives inside a closed shadow
 * root injected into arbitrary host pages (see `lib/content/shadow-host.ts`). The
 * UI is built imperatively (DOM in TS, not JSX), so `build:css` scans `src` for
 * the utility class strings authored in `cube-renderer`, `conveyor-engine`,
 * `theme-engine`, `terminal`, and the face modules, and compiles them — plus the
 * irreducible rules in `styles/conveyor.css` — to plain static CSS via @unocss/cli.
 *
 * preflight: scanning a content-script surface must NOT ship a global reset (it
 * would leak into the shadow tree and perturb the tuned cube geometry). Disabled
 * both here and via the CLI's `--no-preflights` flag in the `build:css` script.
 *
 * blocklist: scanning raw `.ts` also harvests bare identifiers that collide with
 * preset utilities/shortcuts (`container`, `grid`, `label`, `surface`, …). None of
 * these are authored by the extension, so they are blocked to keep the shadow
 * stylesheet to exactly the classes the UI uses.
 */
export default defineSomeUiConfig(
  { preflight: false },
  {
    content: {
      filesystem: ["src/**/*.{ts,tsx,html}", "src/styles/*.css"],
    },
    blocklist: [
      "container",
      "contents",
      "grid",
      "hidden",
      "inline",
      "fixed",
      "static",
      "border",
      "shadow",
      "surface",
      "label",
      "visible",
      "transform",
      "transition",
      "resize",
      "ms",
      "tab",
      "px",
    ],
  }
)
