// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useOverflows } from "."

/** An element whose box and content are `client` and `scroll` px tall. */
function boxOf(
  scroll: number,
  client: number,
  children: Array<Element> = []
): HTMLElement {
  const e = document.createElement("div")
  Object.defineProperty(e, "scrollHeight", { value: scroll })
  Object.defineProperty(e, "clientHeight", { value: client })
  for (const child of children) e.appendChild(child)
  return e
}

describe("useOverflows", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("says a box whose content runs past it overflows, and one that fits doesn't", () => {
    const { result } = renderHook(() => useOverflows("a"))
    act(() => result.current.ref(boxOf(120, 100)))
    expect(result.current.overflows).toBe(true)
    act(() => result.current.ref(boxOf(100, 100)))
    expect(result.current.overflows).toBe(false)
  })

  it("counts a child region that runs past its own box only with regions", () => {
    const inner = (): HTMLElement => boxOf(80, 40)
    const plain = renderHook(() => useOverflows("a"))
    act(() => plain.result.current.ref(boxOf(100, 100, [inner()])))
    expect(plain.result.current.overflows).toBe(false)
    const regions = renderHook(() => useOverflows("a", { regions: true }))
    act(() => regions.result.current.ref(boxOf(100, 100, [inner()])))
    expect(regions.result.current.overflows).toBe(true)
  })
})
