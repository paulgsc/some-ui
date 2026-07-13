import type { StyleContext } from "@some-ui/styles/styles-build"

/**
 * Example of the per-workspace declaration a ui package or app ships. The
 * abstract engine (compile.mjs / run.mjs) lives in @some-ui/styles; a consumer
 * only states which source contributes class candidates and where the compiled
 * stylesheet goes.
 *
 * An aggregating consumer such as apps/www would instead list its own `src/**`
 * plus each in-graph package's `src/**`, e.g.
 *   content: [
 *     "src/**\/*.{ts,tsx}",
 *     "../../packages/ui/honeycomb/src/**\/*.{ts,tsx}",
 *     ...
 *   ]
 * so the whole graph is scanned in one pass.
 */
const context: StyleContext = {
  default: {
    content: ["src/**/*.{ts,tsx}"],
    outFile: "dist/styles.css",
  },
}

export default context
