/**
 * @vitest-environment jsdom
 *
 * LA8's background stop: a sync that starts while the app is already hidden
 * is stopped at once, not at the next change.
 */
import { afterEach, describe, expect, it } from "vitest"

import { onHidden } from "@/lib/home-link/visibility"

function showAs(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
}

afterEach(() => {
  showAs("visible")
})

describe("onHidden", () => {
  it("calls at once when already hidden, then on each hide until unsubscribed", () => {
    let calls = 0
    showAs("hidden")
    const stop = onHidden(() => {
      calls += 1
    })
    expect(calls).toBe(1)

    showAs("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(calls).toBe(1)
    showAs("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(calls).toBe(2)

    stop()
    document.dispatchEvent(new Event("visibilitychange"))
    expect(calls).toBe(2)
  })
})
