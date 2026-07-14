// Shared resolution of a StyleTargetContext (see types.ts) into the absolute
// inputs the compiler and the dev server both need. Kept engine-internal and
// dependency-free so run.mjs, dev-config.ts, and the tests all agree on how a
// declared context maps onto the filesystem.
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ENGINE_DIR = fileURLToPath(new URL(".", import.meta.url))

/** Absolute path to the canonical shared Tailwind entry, "@some-ui/styles/tailwind.css". */
export const CANONICAL_ENTRY = resolve(ENGINE_DIR, "../tailwind.css")

const abs = (root, p) => (isAbsolute(p) ? p : resolve(root, p))

/**
 * @param {import("./types.ts").StyleContext} context
 * @param {string} root  Workspace root the relative fields resolve against.
 * @param {string} [target]
 * @returns {{ target: string, content: string[], entry: string, outFile: string, minify: boolean }}
 */
export function resolveContext(context, root, target = "default") {
  // No silent fallback to `default`: an unknown target in a build is a typo we
  // want surfaced, not quietly ignored. (The dev helper is deliberately more
  // lenient — see dev-config.ts.)
  const ctx = context[target]
  if (!ctx) {
    const available = Object.keys(context).join(", ") || "(none)"
    throw new Error(
      `styles-build: style.context has no "${target}" target (available: ${available})`
    )
  }
  if (!Array.isArray(ctx.content) || ctx.content.length === 0) {
    throw new Error(
      `styles-build: target "${target}" declares no \`content\` globs to scan`
    )
  }
  return {
    target,
    content: ctx.content.map((glob) => abs(root, glob)),
    entry: ctx.entry ? abs(root, ctx.entry) : CANONICAL_ENTRY,
    outFile: abs(root, ctx.outFile ?? "dist/styles.css"),
    minify: ctx.minify ?? true,
  }
}

/**
 * The `@source` block that scopes the single pass to exactly the declared
 * content — the deterministic core. Because these are explicit absolute
 * sources (and the compiler runs with an empty scan `base`), the output
 * depends only on the declared graph, never on cwd auto-detection that
 * differs between a warm local checkout and a cold Docker layer.
 *
 * @param {string[]} contentAbs  Absolute content globs.
 * @returns {string}
 */
export function toSourceDirectives(contentAbs) {
  return contentAbs.map((glob) => `@source "${glob}";`).join("\n")
}

// Sentinel that marks a stylesheet the dev injector has already appended to,
// keeping the transform idempotent across HMR re-runs.
export const SOURCE_SENTINEL = "/* some-ui-styles:sources */"

// Markers present in a workspace's Tailwind entry: it either imports the shared
// layer by package specifier, or is the shared layer itself.
const ENTRY_MARKERS = ["@some-ui/styles/tailwind.css", '@import "tailwindcss"']

/**
 * Pure decision for the dev source-injector (see dev-config.ts): given a CSS
 * module's source, return the source with the declared `@source` block appended
 * when it's the Tailwind entry and hasn't been injected yet, else null (leave
 * untouched). Append-only and idempotent, so it never disturbs authored CSS.
 *
 * @param {string} code           CSS module source.
 * @param {string[]} contentAbs   Absolute content globs.
 * @returns {string | null}
 */
export function buildSourceInjection(code, contentAbs) {
  if (contentAbs.length === 0) return null
  if (code.includes(SOURCE_SENTINEL)) return null
  if (!ENTRY_MARKERS.some((marker) => code.includes(marker))) return null
  return `${code}\n${SOURCE_SENTINEL}\n${toSourceDirectives(contentAbs)}\n`
}

/**
 * The dev source-injector's per-module decision (see dev-config.ts): inject the
 * `@source` block only into CSS modules. Vite tags CSS ids with query suffixes
 * (e.g. `index.css?used`), so match on the path before the query.
 *
 * @param {string} code           Module source.
 * @param {string} id             Vite module id (may carry a `?query`).
 * @param {string[]} contentAbs   Absolute content globs.
 * @returns {string | null}
 */
export function injectSourcesForCssId(code, id, contentAbs) {
  const path = id.split("?")[0] ?? id
  if (!path.endsWith(".css")) return null
  return buildSourceInjection(code, contentAbs)
}
