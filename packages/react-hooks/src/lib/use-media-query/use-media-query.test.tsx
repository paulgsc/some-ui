// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useMediaQuery } from "./use-media-query"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "matchMedia")
})

const Probe = ({ query }: { query: string }): React.JSX.Element => (
  <output data-testid="matches">{String(useMediaQuery(query))}</output>
)

describe("useMediaQuery", () => {
  it("answers the query it is given now, and follows only that one", () => {
    const matching = new Set(["(a)"])
    const listeners = new Map<string, Set<() => void>>()
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        get matches(): boolean {
          return matching.has(query)
        },
        addEventListener: (_: string, listener: () => void): void => {
          const set = listeners.get(query) ?? new Set()
          set.add(listener)
          listeners.set(query, set)
        },
        removeEventListener: (_: string, listener: () => void): void => {
          listeners.get(query)?.delete(listener)
        },
      }),
    })

    const { rerender } = render(<Probe query="(a)" />)
    expect(screen.getByTestId("matches").textContent).toBe("true")

    rerender(<Probe query="(b)" />)
    expect(screen.getByTestId("matches").textContent).toBe("false")
    expect(listeners.get("(a)")?.size).toBe(0)

    act(() => {
      matching.add("(b)")
      for (const listener of listeners.get("(b)") ?? []) listener()
    })
    expect(screen.getByTestId("matches").textContent).toBe("true")
  })
})
