// Copyright (c) 2026 paulgsc — MIT License
//
// URL scheme guard for DOM sinks that accept user-influenced addresses
// (favicons read from tab metadata). Keeps `javascript:`/`data:text-html`
// style payloads out of `img.src`/`link.href`, satisfying CodeQL's XSS
// data-flow checks.

/**
 * True when `url` is safe to assign to an image/icon source — i.e. it resolves
 * to an `https:`, `http:`, or `data:` resource. Anything else (notably
 * `javascript:`) or an unparseable value is rejected.
 */
export function isSafeFaviconUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:" || protocol === "data:"
  } catch {
    return false
  }
}
