/**
 * @vitest-environment jsdom
 */
import type { JSX } from "react"
import { AppToaster } from "@/providers/toaster"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// What is under test is the position this app asks for, not sonner's own
// rendering of it.
vi.mock("sonner", () => ({
  Toaster: ({ position }: { position?: string }): JSX.Element => (
    <div data-testid="toaster" data-position={position} />
  ),
}))

function viewport(mobile: boolean): void {
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

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "matchMedia")
})

describe("AppToaster", () => {
  it("brings toasts in from the top on a phone, clear of the bottom controls", () => {
    viewport(true)
    const { getByTestId } = render(<AppToaster />)
    expect(getByTestId("toaster").getAttribute("data-position")).toBe(
      "top-center"
    )
  })

  it("keeps them in the bottom-right corner on a wide screen", () => {
    viewport(false)
    const { getByTestId } = render(<AppToaster />)
    expect(getByTestId("toaster").getAttribute("data-position")).toBe(
      "bottom-right"
    )
  })
})
