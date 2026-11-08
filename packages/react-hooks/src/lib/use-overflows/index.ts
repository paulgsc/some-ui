/**
 * Whether an element's content runs past its box, as laid out now, so a
 * stage can say a scene doesn't fit before a recorder cuts it off
 * (`data-overflow`). With `regions`, each child counts as well: a frame's
 * header, body and footer, each clipped on its own.
 *
 * Measured when the element mounts (a frame may mount late, once its data is
 * read), when `key` changes, when it resizes and when a web font lands: the
 * box keeps its size while a font loads, so the observer alone never sees
 * text that grew with it.
 */
import { useLayoutEffect, useState } from "react"

export function useOverflows(
  key: string,
  { regions = false }: { readonly regions?: boolean } = {}
): {
  readonly ref: (element: HTMLElement | null) => void
  readonly overflows: boolean
} {
  const [box, setBox] = useState<HTMLElement | null>(null)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    if (box === null) return undefined
    const runsPast = (e: Element): boolean =>
      e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1
    const measure = (): void => {
      setOverflows(
        runsPast(box) || (regions && [...box.children].some(runsPast))
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    document.fonts.addEventListener("loadingdone", measure)
    return (): void => {
      observer.disconnect()
      document.fonts.removeEventListener("loadingdone", measure)
    }
  }, [box, key, regions])
  return { ref: setBox, overflows }
}
