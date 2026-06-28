// Copyright (c) 2026 paulgsc — MIT License
//
// Reader for the suspend-page address. The writer is `buildSuspendUrl` in
// `src/worker/core/suspend-url.ts`; that file documents the URL shape and why
// it lives in the hash (#339). The two are deliberately kept in separate
// modules across the worker/page boundary so neither becomes a Rollup chunk
// shared with the classic background script — `suspend-url.test.ts` round-trips
// build → parse to guarantee they never drift. The `uri=` separator below must
// match the writer.

/** Decoded parameters describing the tab that was suspended. */
export type SuspendParams = {
  url: string
  title: string
}

/** Field marker for the verbatim original address; keep in sync with the writer. */
const URI_FIELD = "uri="

/**
 * Reads the suspend parameters back out of the page address. The current hash
 * form is preferred; the legacy `?url=…&title=…&favicon=…` query form is still
 * understood so tabs suspended by an earlier build survive an extension update.
 */
export function parseSuspendParams(
  search: string,
  hash: string
): SuspendParams {
  const h = hash.replace(/^#/, "")

  // Current form: `title=…&uri=<raw address>` in the hash. The address is the
  // tail after `uri=`, taken whole so an embedded `&`/`?`/`#` survives intact.
  const uriAt = h.startsWith(URI_FIELD)
    ? 0
    : (() => {
        const i = h.indexOf(`&${URI_FIELD}`)
        return i === -1 ? -1 : i + 1
      })()
  if (uriAt !== -1) {
    const url = h.slice(uriAt + URI_FIELD.length)
    const before = h.slice(0, uriAt).replace(/&$/, "")
    return { url, title: new URLSearchParams(before).get("title") ?? "" }
  }

  // Legacy form: url/title/favicon as query (or hash) params. This also covers
  // a current-form hash that carries only `title=…` with no address.
  const fromSearch = new URLSearchParams(search)
  const fromHash = new URLSearchParams(h)
  const pick = (key: string): string =>
    fromSearch.get(key) ?? fromHash.get(key) ?? ""
  return { url: pick("url"), title: pick("title") }
}
