import type { Plugin } from "vite"

import type { ViteConfigOptions } from "../../types/index.js"
import { updatePackageJson } from "./write.js"

/**
 * Syncs the package's build-output fields (main/module/types/exports/...) into
 * its package.json as a BUILD LIFECYCLE side effect.
 *
 * The write deliberately hangs off a hook rather than running while the config
 * object is being constructed. Constructing a plugin is inert; only an actual
 * `vite build` invokes its hooks. Anything that merely *loads* a
 * vite.config.ts to inspect it - knip's vite plugin walking workspace entry
 * points, IDE tooling, config-dumping commands - gets the plugin object and
 * nothing else, so it can no longer rewrite the manifest as a side effect of
 * analysis.
 *
 * `apply: "build"` additionally keeps dev/serve out of it, and `closeBundle`
 * (rather than `buildStart`) means the fields are written only once the
 * artifacts they point at have actually been emitted - a failed build now
 * leaves package.json alone instead of pointing it at a dist/ that was never
 * produced.
 */
export function createPackageJsonPlugin(
  options: ViteConfigOptions,
  packageRoot: string
): Plugin {
  return {
    name: "some-ui:sync-package-json",
    apply: "build",
    closeBundle(): void {
      try {
        updatePackageJson(options, packageRoot)
      } catch (error) {
        // Matches the previous non-fatal behaviour: a manifest that could not
        // be rewritten is reported, but does not fail an otherwise good build.
        // eslint-disable-next-line no-console
        console.warn("Failed to update package.json:", error)
      }
    },
  }
}
