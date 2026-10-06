// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { HANDHELD_QUERY, isHandheldBox, useIsMobile } from "./use-mobile"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "matchMedia")
})

describe("isHandheldBox", () => {
  it.each([
    [390, 780, true, "a phone upright"],
    [780, 390, true, "the same phone on its side"],
    [844, 390, true, "a larger phone on its side"],
    [767, 900, true, "just under md"],
    [768, 900, false, "md"],
    [1280, 479, true, "a wide window shorter than 480"],
    [1280, 480, false, "a wide window 480 tall"],
    [1280, 800, false, "a laptop"],
  ])("%ix%i is %s (%s)", (width, height, expected) => {
    expect(isHandheldBox({ width, height })).toBe(expected)
  })
})

describe("useIsMobile", () => {
  const Probe = (): React.JSX.Element => (
    <output data-testid="handheld">{String(useIsMobile())}</output>
  )

  it("asks the handheld query, and follows it when the window changes", () => {
    let matches = true
    const listeners = new Set<() => void>()
    const asked: Array<string> = []
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => {
        asked.push(query)
        return {
          get matches(): boolean {
            return matches
          },
          addEventListener: (_: string, listener: () => void): void => {
            listeners.add(listener)
          },
          removeEventListener: (_: string, listener: () => void): void => {
            listeners.delete(listener)
          },
        }
      },
    })

    render(<Probe />)
    expect(screen.getByTestId("handheld").textContent).toBe("true")
    expect(new Set(asked)).toEqual(new Set([HANDHELD_QUERY]))

    act(() => {
      matches = false
      for (const listener of listeners) listener()
    })
    expect(screen.getByTestId("handheld").textContent).toBe("false")
  })
})

describe("the CSS half of the rule", () => {
  // `handheld:` in @some-ui/styles is the same query for class names; a
  // landscape phone given a phone's tree and a desktop's styles is what the
  // two drifting apart looks like.
  it("is the `handheld:` variant, with the same query", () => {
    const css = readFileSync(
      resolve(import.meta.dirname, "../../../../some-styles/tailwind.css"),
      "utf8"
    )
    const variant = css.slice(css.indexOf("@custom-variant handheld {"))
    expect(variant).toMatch(/^@custom-variant handheld \{\s*@media /)
    expect(variant).toContain(`@media ${HANDHELD_QUERY} {`)
  })
})
