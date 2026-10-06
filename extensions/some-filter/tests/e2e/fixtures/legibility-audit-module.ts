/**
 * Compiles `src/adapter/legibility-audit.ts` into a browser-runnable IIFE for
 * real-Chromium specs that need the module independent of the full pipeline
 * (whose per-surface theming can repair a carrier before the audit runs).
 *
 * Unlike `inline-module.ts`'s bare `ts.transpileModule` (fine for modules
 * with no runtime imports), this module has real cross-file imports, so it
 * goes through Vite's build; `configFile: false` skips the extension's
 * multi-entry `vite.config.ts`.
 */

import path from "path"
import { fileURLToPath } from "url"
import { build } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, "../../..")

export const LEGIBILITY_AUDIT_GLOBAL = "LegibilityAuditModule" as const

let cached: string | undefined

export async function legibilityAuditScript(): Promise<string> {
  if (cached !== undefined) return cached

  const result = await build({
    root: PACKAGE_ROOT,
    configFile: false,
    resolve: {
      alias: {
        "@filter": path.join(PACKAGE_ROOT, "src"),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(PACKAGE_ROOT, "src/adapter/legibility-audit.ts"),
        name: LEGIBILITY_AUDIT_GLOBAL,
        formats: ["iife"],
        fileName: () => "legibility-audit.iife.js",
      },
    },
    logLevel: "warn",
  })

  // `write: false` resolves to a `RolldownOutput` (or, in this configuration,
  // an array of exactly one) whose `.output` holds the single IIFE chunk.
  // Watch mode's `RolldownWatcher` is never requested.
  const single = Array.isArray(result) ? result[0] : result
  if (single === undefined || !("output" in single)) {
    throw new Error(
      "[legibility-audit-module] vite build returned an unexpected (watch-mode) result"
    )
  }
  const [chunk] = single.output
  if (chunk === undefined || chunk.type !== "chunk") {
    throw new Error("[legibility-audit-module] vite build produced no JS chunk")
  }

  cached = chunk.code
  return chunk.code
}
