import type { StyleContext } from "./types.js"

/** Absolute path to the canonical shared Tailwind entry, "@some-ui/styles/tailwind.css". */
export declare const CANONICAL_ENTRY: string

export type ResolvedStyleContext = {
  target: string
  content: Array<string>
  entry: string
  outFile: string
  minify: boolean
}

/** Resolve a declared context's relative fields against a workspace root. */
export declare function resolveContext(
  context: StyleContext,
  root: string,
  target?: string
): ResolvedStyleContext

/** The `@source` block that scopes the single pass to exactly `contentAbs`. */
export declare function toSourceDirectives(contentAbs: Array<string>): string

/** Sentinel marking a stylesheet the dev injector has already appended to. */
export declare const SOURCE_SENTINEL: string

/**
 * Pure decision for the dev source-injector: returns `code` with the declared
 * `@source` block appended when it's the Tailwind entry and not yet injected,
 * else null.
 */
export declare function buildSourceInjection(
  code: string,
  contentAbs: Array<string>
): string | null
