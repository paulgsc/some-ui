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
 */
const uiPackages = [
  "calendar",
  "chat",
  "dice-card",
  "emoji-animations",
  "honeycomb",
  "input",
  "makjang",
  "neon-sign",
  "nfl",
  "overlays",
  "portfolio-chart",
  "resume",
  "shared",
  "slideshow",
  "stepper",
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
