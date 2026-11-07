/**
 * Shows `items` on a screen's visit as `shelf` while the calling part of the
 * screen is mounted, and takes them off as it unmounts (`@some-ui/engagement`'s
 * `Visit.show`, ENGAGE #2533). Typed by shape, so a package can use it
 * without depending on `@some-ui/engagement`; `null` shows nothing.
 */
import { useEffect } from "react"

export type Shelves<T> = {
  readonly show: (shelf: string, items: ReadonlyArray<T> | null) => void
}

export function useShelf<T>(
  visit: Shelves<T> | undefined,
  shelf: string,
  items: ReadonlyArray<T> | null
): void {
  useEffect(() => {
    if (visit === undefined) return
    visit.show(shelf, items)
    return (): void => {
      visit.show(shelf, null)
    }
  }, [visit, shelf, items])
}
