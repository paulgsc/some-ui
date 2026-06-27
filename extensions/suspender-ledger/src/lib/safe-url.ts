// Copyright (c) 2026 paulgsc — MIT License
//
// URL scheme guards for DOM sinks that accept user-influenced addresses
// (favicons read from page params / tab metadata, restore targets). These keep
// `javascript:`/`data:text-html` style payloads out of `img.src`, `link.href`,
// and navigation, satisfying CodeQL's XSS / open-redirect data-flow checks.

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

/**
 * True when `url` is safe to navigate the tab back to. Only the schemes a
 * suspended page could legitimately have come from are allowed.
 */
export function isRestorableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "ftp:" ||
      protocol === "file:"
    )
  } catch {
    return false
  }
}
