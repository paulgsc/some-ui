/**
 * `window.localStorage`, or null wherever touching it throws (privacy mode,
 * a sandboxed frame) or there is no window (Node, a prerender).
 */
export function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}
