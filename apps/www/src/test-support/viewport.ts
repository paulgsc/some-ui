/**
 * A phone-width or a wide window for a jsdom test.
 *
 * `useIsMobile` (some-ui-utils) reads a media query, and jsdom has none, so
 * any test that renders something calling it has to pick a side. This is the
 * one place that says how; pair it with `resetViewport` in `afterEach` so the
 * pick never outlives the test that made it.
 */

export function setViewport(mobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (
      query: string
    ): Pick<
      MediaQueryList,
      "matches" | "media" | "addEventListener" | "removeEventListener"
    > => ({
      matches: mobile,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }),
  })
}

export function resetViewport(): void {
  Reflect.deleteProperty(window, "matchMedia")
}
