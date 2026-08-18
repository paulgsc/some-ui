import { noManualBuildExclude } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * Plugin guarding library-build hygiene: the declaration-emit excludes for
 * tests, stories, data, assets and shared-content paths are owned centrally by
 * @some-ui/vite-config's createPlugins(), not by each workspace's vite.config.
 * See no-manual-build-exclude for the rationale (the "add-it-in-N-workspaces"
 * whack-a-mole this prevents).
 */
export const buildHygienePlugin = {
  meta: { name: "build-hygiene", version: "0.0.1" },
  rules: {
    "no-manual-build-exclude": noManualBuildExclude,
  },
}

/**
 * On by default (included in maishatuRecommended). Like wasm-loader-guard this
 * is a regression guard, not a style preference: the rule only fires on
 * createViteConfig/createReactLibConfig call sites (the packages/ui/* library
 * builds), so it is inert for extension/app vite configs that don't emit
 * declarations. Scoped to vite.config files to avoid walking every source file.
 */
export default defineConfig([
  {
    files: ["**/vite.config.{ts,mts,cts}", "**/vite.config.*.{ts,mts,cts}"],
    plugins: { "build-hygiene": buildHygienePlugin },
    rules: {
      "build-hygiene/no-manual-build-exclude": "error",
    },
  },
])
