#!/usr/bin/env node
// The one network path the résumé build has: the pinned typst release and the
// pinned font files (scripts/typst.mjs, scripts/fonts.mjs) both come through
// here.
//
// Two things `fetch()` does not do on its own (#1451):
//
// - Say what failed. A connection that never completes throws a bare
//   "fetch failed" and puts the reason — an errno, a TLS verdict, a DNS
//   miss — only on `err.cause`, often nested. The error thrown here names
//   the URL and the whole cause chain, so a reader can tell a transient reset
//   from a network policy block from a proxy CA the runtime does not trust:
//   four causes with four different remedies.
// - Retry. A small bounded retry with backoff, for connection-level failures
//   and 5xx only. A 4xx is an answer, not a blip — a moved or deleted asset —
//   and fails at once. Retrying cannot introduce drift: callers verify what
//   they receive (fonts.mjs by SHA-256) and fail loudly on a mismatch, which
//   is never retried either.

const ATTEMPTS = 3
const BACKOFF_MS = 1_000

/** "fetch failed <- connect ECONNREFUSED 127.0.0.1:9 (ECONNREFUSED)" */
function describe(err) {
  const parts = []
  for (let e = err; e != null && parts.length < 6; e = e.cause) {
    if (typeof e !== "object") {
      parts.push(String(e))
      break
    }
    const code =
      e.code && !String(e.message).includes(e.code) ? ` (${e.code})` : ""
    parts.push(`${e.message ?? e}${code}`)
  }
  return parts.join(" <- ")
}

class HttpError extends Error {
  constructor(url, status) {
    super(`Failed to download ${url}: HTTP ${status}`)
    this.status = status
  }
}

const transient = (err) => !(err instanceof HttpError) || err.status >= 500

/** Downloads `url` into memory, retrying transient failures. */
export async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new HttpError(url, res.status)
      // Inside the try: a connection reset mid-body is as transient as one
      // before the headers.
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (!transient(err)) throw err
      const reason =
        err instanceof HttpError
          ? err.message
          : `Failed to download ${url}: ${describe(err)}`
      if (attempt >= ATTEMPTS) {
        throw new Error(`${reason} (gave up after ${attempt} attempts)`)
      }
      const wait = BACKOFF_MS * 2 ** (attempt - 1)
      // eslint-disable-next-line no-console
      console.warn(
        `[resume] ${reason}; retrying in ${wait / 1000}s (attempt ${attempt + 1} of ${ATTEMPTS})`
      )
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}
