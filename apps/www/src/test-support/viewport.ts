/**
 * A phone-width or a wide window for a jsdom test.
 *
 * `useIsMobile` (some-ui-utils) reads a media query, and jsdom has none, so
 * any test that renders something calling it has to pick a side. This is the
 * one place that says how; pair it with `resetViewport` in `afterEach` so the
 * pick never outlives the test that made it.
 *
 * A pick can also change mid-test (`turnViewport`), the way a phone turned
 * over or a window dragged across `md` changes it under a mounted tree. A
 * fixed pick can only show that each layout renders; whether something
 * *survives* crossing between them - a lesson, a half-typed search - is only
 * visible across the change.
 */

import { act } from "react"

let handheld = false
const listeners = new Set<EventListener>()

export function setViewport(mobile: boolean): void {
  handheld = mobile
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (
      query: string
    ): Pick<
      MediaQueryList,
      "matches" | "media" | "addEventListener" | "removeEventListener"
    > => ({
      get matches(): boolean {
        return handheld
      },
      media: query,
      addEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject
      ): void => {
        if (typeof listener === "function") listeners.add(listener)
      },
      removeEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject
      ): void => {
        if (typeof listener === "function") listeners.delete(listener)
      },
    }),
  })
}

/** Changes the pick under whatever is mounted, as a real media query would. */
export function turnViewport(mobile: boolean): void {
  act(() => {
    handheld = mobile
    for (const listener of [...listeners]) listener(new Event("change"))
  })
}

export function resetViewport(): void {
  listeners.clear()
  Reflect.deleteProperty(window, "matchMedia")
}
