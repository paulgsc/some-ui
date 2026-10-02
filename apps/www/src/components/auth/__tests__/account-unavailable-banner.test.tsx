/**
 * @vitest-environment jsdom
 *
 * A lost session says so in place and sends the person nowhere: the banner is
 * the whole response, and it appears only when the account was chosen and its
 * session is gone.
 */

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (): string => "/sessions?tab=done",
  Link: ({
    to,
    search,
    children,
  }: {
    to: string
    search: { redirect: string }
    children: ReactNode
  }): ReactNode => (
    <a href={`${to}?redirect=${encodeURIComponent(search.redirect)}`}>
      {children}
    </a>
  ),
}))

const { AccountUnavailableBanner } = await import(
  "@/components/auth/account-unavailable-banner"
)

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
})

afterEach(() => {
  cleanup()
})

describe("AccountUnavailableBanner", () => {
  it("is silent while learning on the device and while signed in", () => {
    const { container, rerender } = render(<AccountUnavailableBanner />)
    expect(container.textContent).toBe("")

    authority.dispatch({ type: "session-started", adopt: true })
    rerender(<AccountUnavailableBanner />)
    expect(container.textContent).toBe("")
  })

  it("says the session ended, that learning goes on here, and links to sign in from where the person is", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
    render(<AccountUnavailableBanner />)

    expect(screen.getByRole("status").textContent).toMatch(
      /account session ended.*nothing is being sent.*keep learning on this device/i
    )
    expect(
      screen
        .getByRole("link", { name: /sign in to see your account's data/i })
        .getAttribute("href")
    ).toBe("/auth?redirect=%2Fsessions%3Ftab%3Ddone")
  })

  it("goes away once the person has chosen the device", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
    const { container, rerender } = render(<AccountUnavailableBanner />)
    authority.chooseLocal()
    rerender(<AccountUnavailableBanner />)
    expect(container.textContent).toBe("")
  })
})
