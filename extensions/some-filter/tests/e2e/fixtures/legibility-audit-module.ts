/**
 * Compiles `src/adapter/legibility-audit.ts` into a browser-runnable IIFE
 * for #1374's own e2e regression, and for any future real-Chromium spec
 * that needs this module's real, compiled behavior independent of the full
 * `--load-extension` pipeline (whose per-surface theming can itself repair
 * a carrier's foreground color before this audit ever sees it — confounding
 * an assertion aimed at this module's own resolution logic with an
 * unrelated pipeline behavior).
 *
 * Unlike `inline-module.ts`'s `compileAdapterModuleForBrowser` (a bare
 * `ts.transpileModule` pass, correct only for a zero-runtime-import module
 * like `scope-registry.ts`), `legibility-audit.ts` has real cross-file
 * imports (`@filter/lib/content/color`, `@filter/lib/content/modify-colors`,
 * `./actuator`) that a type-strip-only transpile would leave as unresolved
 * `require(...)` calls. Vite's own build pipeline — already a real
 * dependency of this package, already the tool that builds the actual
 * extension — resolves that graph properly; `configFile: false` skips this
 * project's own `vite.config.ts` (irrelevant here, and its own alias
 * resolution assumes the extension's multi-entry build shape).
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

  // `write: false` (non-watch mode) resolves to a `RolldownOutput` — or, as
  // confirmed directly in this exact build configuration, an array
  // containing exactly one — whose own `.output` array holds Rollup-shaped
  // chunks/assets rather than writing to disk. This build has exactly one
  // JS chunk (the IIFE) and no other assets, so the first chunk is always
  // it. `build()`'s own return type also covers watch mode
  // (`RolldownWatcher`, no `.output`), which this call never requests (no
  // `build.watch` option passed).
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
