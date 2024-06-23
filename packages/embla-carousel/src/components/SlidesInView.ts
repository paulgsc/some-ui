import type { EventHandlerType } from './EventHandler'
import { objectKeys } from './utils'

type IntersectionEntryMapType = Record<number, IntersectionObserverEntry>

export type SlidesInViewOptionsType = IntersectionObserverInit['threshold']

export type SlidesInViewType = {
  init: () => void
  destroy: () => void
  get: (inView?: boolean) => number[]
}

export function SlidesInView(
  container: HTMLElement,
  slides: HTMLElement[],
  eventHandler: EventHandlerType,
  threshold: SlidesInViewOptionsType
): SlidesInViewType {
  const intersectionEntryMap: IntersectionEntryMapType = {}
  let inViewCache: number[] | null = null
  let notInViewCache: number[] | null = null
  let intersectionObserver: IntersectionObserver
  let destroyed = false

  function init(): void {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (destroyed) return

        entries.forEach((entry) => {
          const index = slides.indexOf(entry.target as HTMLElement)
          intersectionEntryMap[index] = entry
        })

        inViewCache = null
        notInViewCache = null
        eventHandler.emit('slidesInView')
      },
      {
        root: container.parentElement,
        threshold
      }
    )

    slides.forEach((slide) => {
      intersectionObserver.observe(slide)
    })
  }

  function destroy(): void {
    try {
      intersectionObserver.disconnect()
    } catch {
      // pass
    } finally {
      destroyed = true
    }
  }

  function createInViewList(inView: boolean): number[] {
    return objectKeys(intersectionEntryMap).reduce(
      (list: number[], slideIndex) => {
        const index = parseInt(slideIndex)
        const { isIntersecting } =
          intersectionEntryMap[index] ?? ({} as IntersectionObserverEntry)
        const inViewMatch = inView && isIntersecting
        const notInViewMatch = !inView && !isIntersecting

        if (inViewMatch || notInViewMatch) list.push(index)
        return list
      },
      []
    )
  }

  function get(inView = true): number[] {
    if (inView && inViewCache) return inViewCache
    if (!inView && notInViewCache) return notInViewCache

    const slideIndexes = createInViewList(inView)

    if (inView) inViewCache = slideIndexes
    if (!inView) notInViewCache = slideIndexes

    return slideIndexes
  }

  const self: SlidesInViewType = {
    init,
    destroy,
    get
  }

  return self
}
