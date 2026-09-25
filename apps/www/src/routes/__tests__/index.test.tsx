/**
 * @vitest-environment jsdom
 *
 * `"/"` is two pages chosen by session: the extensions comb for a visitor
 * with none (on the public site, everyone), and the destinations landing for
 * a signed-in one. The choice is made in the component, not by a redirect,
 * so it is asserted by rendering the route's component under each state -
 * and a session appearing has to swap the page in place, which is what the
 * subscribing `useHasDecorativeSession` read is for.
 */

import type { JSX, ReactNode } from "react"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

let session = false
const listeners = new Set<() => void>()

vi.mock("@/lib/auth-session", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useHasDecorativeSession: (): boolean =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        () => session,
        () => session
      ),
  }
})

vi.mock(
  "@/components/extensions/extensions-page",
  (): { ExtensionsPage: (props: { chrome: string }) => JSX.Element } => ({
    ExtensionsPage: ({ chrome }) => (
      <div data-testid="extensions-page" data-chrome={chrome} />
    ),
  })
)

vi.mock("@/components/theme-switcher", (): { ThemeSwitcher: () => null } => ({
  ThemeSwitcher: () => null,
}))

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return {
      ...actual,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a router-free stand-in; only `to` and children are read
      Link: (({ to, children }: { to: string; children: ReactNode }) => (
        <a href={to}>{children}</a>
      )) as unknown as typeof actual.Link,
    }
  }
)

const { Route } = await import("@/routes/index")

function renderRoot(): void {
  const Component = Route.options.component
  if (!Component) throw new Error('"/" has no component')
  render(<Component />)
}

afterEach(() => {
  cleanup()
  session = false
})

describe('"/"', () => {
  it("is the extensions comb, as the front door, without a session", () => {
    renderRoot()
    const page = screen.getByTestId("extensions-page")
    expect(page.dataset.chrome).toBe("front")
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })

  it("is the destinations landing with a session", () => {
    session = true
    renderRoot()
    expect(screen.queryByTestId("extensions-page")).toBeNull()
    expect(
      screen.getByRole("heading", { level: 1, name: /four projects/i })
    ).toBeTruthy()
  })

  it("swaps to the landing in place when a session appears", () => {
    renderRoot()
    expect(screen.getByTestId("extensions-page")).toBeTruthy()

    act(() => {
      session = true
      for (const listener of listeners) listener()
    })

    expect(screen.queryByTestId("extensions-page")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
  })
})
