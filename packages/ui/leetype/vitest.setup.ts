import "@testing-library/jest-dom/vitest"

import { afterEach, vi } from "vitest"

/**
 * jsdom has no `Element.prototype.scrollIntoView`, which `TypingViewport`
 * calls unconditionally (rightly; the gap is the test environment's). The
 * descriptor check is needed because the DOM types claim it always exists.
 */
if (
  Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView") ===
  undefined
) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function scrollIntoView(): void {
      // Nothing in jsdom scrolls, so there is nothing to do.
    },
  })
}

afterEach(() => {
  vi.useRealTimers()
})
