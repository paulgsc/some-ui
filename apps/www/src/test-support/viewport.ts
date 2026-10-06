/**
 * A phone-width or a wide window for a jsdom test: `useIsMobile` reads a
 * media query jsdom lacks. Pair with `resetViewport` in `afterEach`.
 * `turnViewport` changes it mid-test, to check that something *survives*
 * crossing the breakpoint (a lesson, a half-typed search).
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
