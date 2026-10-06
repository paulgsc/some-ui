/**
 * @vitest-environment jsdom
 *
 * `"/"` is two pages: with a `file_host`, the destinations landing for
 * everyone; on the public site, the extensions comb without a (demo) session
 * and the landing with one. Chosen in the component, so asserted by rendering
 * it under each state; a change swaps the page in place
 * (`useAuthoritySnapshot`).
 */

import type { JSX, ReactNode } from "react"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

type Backend = "none" | "remote" | "in-process"
const state: { backend: Backend; session: string } = {
  backend: "none",
  session: "signed-out",
}
const listeners = new Set<() => void>()

vi.mock("@/lib/authority", async () => {
  const { useSyncExternalStore } = await import("react")
  let snapshot = { ...state }
  const read = (): typeof snapshot => {
    if (
      snapshot.backend !== state.backend ||
      snapshot.session !== state.session
    )
      snapshot = { ...state }
    return snapshot
  }
  return {
    useAuthoritySnapshot: (): typeof snapshot =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        read,
        read
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
  state.backend = "none"
  state.session = "signed-out"
})

describe('"/"', () => {
  it("is the extensions comb, as the front door, on the public site without a session", () => {
    renderRoot()
    const page = screen.getByTestId("extensions-page")
    expect(page.dataset.chrome).toBe("front")
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })

  it("is the destinations landing on the public site once the demo is open", () => {
    state.session = "signed-in"
    renderRoot()
    expect(screen.queryByTestId("extensions-page")).toBeNull()
    expect(
      screen.getByRole("heading", { level: 1, name: /four projects/i })
    ).toBeTruthy()
  })

  it("is the destinations landing wherever there is a server to learn against, with no session", () => {
    state.backend = "remote"
    renderRoot()
    expect(screen.queryByTestId("extensions-page")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
  })

  it("swaps to the landing in place when the demo opens", () => {
    renderRoot()
    expect(screen.getByTestId("extensions-page")).toBeTruthy()

    act(() => {
      state.session = "signed-in"
      for (const listener of listeners) listener()
    })

    expect(screen.queryByTestId("extensions-page")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
  })
})
