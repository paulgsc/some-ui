/**
 * The page's visibility as a port: what a recorder or a store on the phone
 * watches to finish a take when the screen goes, or to try again when it
 * comes back.
 */

/**
 * Calls `listener` at once with whether the page is hidden now, then on
 * each change. Returns the unsubscribe.
 */
export function onPageVisibility(
  listener: (hidden: boolean) => void
): () => void {
  const onChange = (): void => listener(document.visibilityState === "hidden")
  document.addEventListener("visibilitychange", onChange)
  // Now, not only on the next change: a page can mount already hidden.
  onChange()
  return () => document.removeEventListener("visibilitychange", onChange)
}
