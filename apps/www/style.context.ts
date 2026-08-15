import type { StyleContext } from "@some-ui/styles/styles-build"

/**
 * www's declared style graph: its own source plus every in-graph ui package's
 * source. The single `some-styles-build` / dev-server pass scans exactly this
 * union once — so utilities and the shared design layer are generated one time,
 * deterministically, instead of once per package (the source of the Docker
 * static-build drift in #636).
 *
 * This is www's dependency closure that renders UI. Pure build/util packages
 * (vite-config, tsconfig, wasm-loader, fetch-kit, ws, types, *-utils) author no
 * class candidates, so they're omitted; add one here if it ever ships a
 * component.
 *
 * Omitting a package that *does* render is not a missing-stylesheet failure —
 * it degrades far more quietly than that. Tailwind generates a utility if any
 * scanned file mentions it, so an unscanned package still gets every class it
 * happens to share with a scanned one, and loses only the ones unique to it.
 * The result is a component that is 90% styled and wrong in the remaining 10%,
 * which reads as a layout bug in the component rather than a build-config gap.
 *
 * That is exactly how this list lost `leetype`: the challenge picker's stage
 * rail is `flex … sm:w-40 sm:flex-col` beside a `sm:flex-row` parent. The
 * parent's `sm:flex-row` existed (some scanned package used it), the rail's
 * `sm:w-40 sm:flex-col` did not, so the row formed but the rail never became a
 * column — it stretched across the row and squeezed the panel beside it into a
 * one-word-per-line sliver, in apps/www only. See the sibling test, which
 * fails on any renderable package missing from this list.
 */
const uiPackages = [
  "assessment",
  "auth",
  "calendar",
  "chat",
  "dice-card",
  "emoji-animations",
  "honeycomb",
  "input",
  "interview",
  "leetype",
  "makjang",
  "neon-sign",
  "nfl",
  "portfolio-chart",
  "resume",
  "shared",
  "slideshow",
  "stepper",
  "topik",
  "umag",
  "wireframes",
]

const context: StyleContext = {
  default: {
    content: [
      "src/**/*.{ts,tsx}",
      "../../packages/some-content/src/**/*.{ts,tsx,mdx}",
      ...uiPackages.map((p) => `../../packages/ui/${p}/src/**/*.{ts,tsx}`),
    ],
    outFile: "dist/styles.css",
  },
}

export default context
