/**
 * The fourth enforcement layer, and the gap in the other three.
 *
 * `use-intent.ts`'s thundering-herd guard drops the second `start()` in a
 * burst. That is exactly right for the case it was written for (#936's
 * "Save and play" double-click): two clicks on one button are one
 * intention, and the second must not become a second `POST`.
 *
 * It is exactly wrong when one `useIntent` instance serves *several
 * distinct* writes. Binding six panels in a live layout is six intentions,
 * not one - but to a guard that only knows "a dispatch is already in
 * flight", the fifth bind is indistinguishable from a double-click, so it
 * is discarded. Nothing throws, nothing logs, and the optimistic local
 * state still renders the bind, so the screen shows work that was never
 * sent. See `components/player/use-live-layout-editor.ts`, which is where
 * this actually happened.
 *
 * The distinction is not a heuristic - it is exact. A double-click
 * dispatches the *same* variables twice; a lost write dispatches
 * *different* ones. So the guard can keep silently collapsing the first
 * and refuse to be silent about the second.
 *
 * ## Why this throws in tests and only warns in the browser
 *
 * A dropped distinct write is a correctness bug every time, but it is not
 * worth taking someone's session down over: in production the honest
 * response is to drop it exactly as before and say nothing to the person,
 * because there is nothing they can do with the information. In a test it
 * is the whole point - a suite that exercises a per-item write path built
 * on a shared intent fails on the spot rather than passing while the
 * writes evaporate. That is what makes this class of regression red
 * without a lint rule having to recognise it structurally (it cannot:
 * "does this handler represent one intention or many" is a fact about the
 * call site's meaning, not its syntax).
 */

/** `import.meta.env.MODE` is `"test"` under vitest and the deployed mode
 * name otherwise; `DEV` covers `vite dev` and `vite preview`. Read at call
 * time rather than module scope so a test can stub either. */
function isTestEnv(): boolean {
  return import.meta.env.MODE === "test"
}

/**
 * Whether two dispatches are the same intention repeated.
 *
 * `Object.is` first for primitives and for a variables object that is
 * literally reused. Otherwise a structural compare, because the ordinary
 * double-click shape is a handler rebuilding an equal-but-not-identical
 * object on each call (`{ id, patch }`). Key order is stable here because
 * both objects come from the same construction site.
 *
 * Anything `JSON.stringify` cannot serialise (a cycle, a `BigInt`) counts
 * as *different*, which fails toward reporting. A false report is a
 * comment thread; a missed one is silent data loss.
 */
export function isSameDispatch(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object") return false
  if (a === null || b === null) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

const MESSAGE =
  "A distinct write was discarded by the thundering-herd guard. One " +
  "`useIntent` instance is serving several distinct writes, so the guard " +
  "cannot tell a lost write from a double-click. Coalesce the writes into " +
  "one dispatch (see `use-live-layout-editor.ts`'s persist scheduler), or " +
  "give each write its own intent instance (see `sessions/index.tsx`, " +
  "where each row holds its own)."

/**
 * Called by the guards when they drop a dispatch whose variables differ
 * from the one already in flight.
 *
 * Throws under vitest, warns in a dev browser, and is silent in
 * production - see this module's header for why those three differ.
 */
export function reportDroppedWrite(site: string): void {
  const detail = `${MESSAGE} Dropped at: ${site}.`
  if (isTestEnv()) {
    throw new Error(detail)
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[intent] ${detail}`)
  }
}
