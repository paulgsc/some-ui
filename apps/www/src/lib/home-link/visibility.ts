/**
 * The app going to the background, for the runtime's stop (LA8): a sync
 * that starts while the app is already hidden (it went there while the
 * phone's database opened) is stopped at once, not at the next change.
 */
export function onHidden(
  listener: () => void,
  doc: Document = document
): () => void {
  const changed = (): void => {
    if (doc.visibilityState === "hidden") listener()
  }
  doc.addEventListener("visibilitychange", changed)
  changed()
  return () => doc.removeEventListener("visibilitychange", changed)
}
