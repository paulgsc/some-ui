/**
 * @vitest-environment jsdom
 *
 * The composer on a phone: the lesson CRM's shape (`@some-ui/lesson-crm`) -
 * one concern per pane, switched with a bottom tab bar, no Back and Continue.
 * The wide layout's own flows are `session-composer.test.tsx`'s.
 */

import type { JSX, ReactNode } from "react"
import { resetViewport, setViewport } from "@/test-support/viewport"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return { ...actual, useNavigate: () => vi.fn() }
  }
)

const { SessionComposer } = await import(
  "@/components/composer/session-composer"
)

function withQueryClient(children: ReactNode): JSX.Element {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

const PANES = ["Browse", "Added", "Configure", "Arrange", "Review"] as const

beforeEach(() => {
  setViewport(true)
  // The tenant hooks make an incidental list request on import; nothing here
  // needs an answer to it.
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetViewport()
})

const isDisabled = (element: HTMLElement): boolean =>
  element instanceof HTMLButtonElement && element.disabled

const isSelected = (element: HTMLElement): boolean =>
  element.getAttribute("aria-selected") === "true"

/** Whether nothing between `element` and the document hides it. */
const isShown = (element: HTMLElement): boolean =>
  element.closest("[hidden]") === null

/** A tab by its pane name, whether or not it is wearing a count. */
function tab(name: (typeof PANES)[number]): HTMLElement {
  return screen.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) })
}

/** The first card in the Browse pane's catalogue. */
function firstCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>(
    "#composer-pane-browse .grid > button"
  )
  if (!card) throw new Error("the Browse pane shows no activity card")
  return card
}

describe("SessionComposer on a phone", () => {
  it("is a tab bar of panes, not a wizard", () => {
    render(withQueryClient(<SessionComposer />))

    const bar = screen.getByRole("tablist", { name: "Composer panes" })
    expect(
      within(bar)
        .getAllByRole("tab")
        .map((t) => t.textContent)
    ).toEqual([...PANES])

    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
    expect(
      screen.queryByRole("navigation", { name: "Composer steps" })
    ).toBeNull()
  })

  it("opens on Browse, and shows one pane at a time", () => {
    const { container } = render(
      withQueryClient(<SessionComposer initialActivity="honeycomb" />)
    )

    expect(isSelected(tab("Browse"))).toBe(true)
    for (const pane of ["browse", "added", "configure", "arrange", "review"]) {
      const panel = container.querySelector<HTMLElement>(
        `#composer-pane-${pane}`
      )
      expect(panel, pane).not.toBeNull()
      expect(panel?.hidden, pane).toBe(pane !== "browse")
    }
  })

  it("holds back what needs an activity until one is added", () => {
    render(withQueryClient(<SessionComposer />))

    // Browse and Added are both step 1: always reachable, and Added says
    // plainly that it is empty. The rest are as unreachable as the wide
    // layout's step rail is before anything is chosen.
    expect(isDisabled(tab("Browse"))).toBe(false)
    expect(isDisabled(tab("Added"))).toBe(false)
    expect(isDisabled(tab("Configure"))).toBe(true)
    expect(isDisabled(tab("Arrange"))).toBe(true)
    expect(isDisabled(tab("Review"))).toBe(true)
  })

  it("opens the rest, and counts on Added, once a card is tapped", () => {
    const { container } = render(withQueryClient(<SessionComposer />))

    fireEvent.click(firstCard(container))

    expect(isDisabled(screen.getByRole("tab", { name: "Added, 1" }))).toBe(
      false
    )
    expect(isDisabled(tab("Configure"))).toBe(false)
    expect(isDisabled(tab("Arrange"))).toBe(false)
    expect(isDisabled(tab("Review"))).toBe(false)
  })

  it("switches panes from the bar, and remembers the search it was left on", () => {
    render(withQueryClient(<SessionComposer initialActivity="honeycomb" />))

    const search = screen.getByRole("searchbox", { name: "Filter activities" })
    fireEvent.change(search, { target: { value: "zzz" } })

    fireEvent.click(tab("Review"))
    expect(isSelected(tab("Review"))).toBe(true)
    expect(
      screen.queryByRole("searchbox", { name: "Filter activities" })
    ).toBeNull()

    fireEvent.click(tab("Browse"))
    const restored = screen.getByRole("searchbox", {
      name: "Filter activities",
    })
    expect(restored instanceof HTMLInputElement && restored.value).toBe("zzz")
  })

  it("finishes in the Review pane, where the save controls live", () => {
    render(withQueryClient(<SessionComposer initialActivity="honeycomb" />))

    // Not reachable while another pane is showing.
    expect(screen.queryByRole("button", { name: "Save as draft" })).toBeNull()

    fireEvent.click(tab("Review"))

    expect(
      isDisabled(screen.getByRole("button", { name: "Save as draft" }))
    ).toBe(false)
    expect(
      isDisabled(screen.getByRole("button", { name: /save & play/i }))
    ).toBe(false)
  })

  it("sends an empty Added pane back to Browse", () => {
    render(withQueryClient(<SessionComposer />))

    fireEvent.click(tab("Added"))
    expect(isShown(screen.getByText(/nothing added yet/i))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Browse activities" }))

    expect(isSelected(tab("Browse"))).toBe(true)
  })
})

describe("SessionComposer on a wide screen", () => {
  it("is still the wizard: a step rail, Back and Continue, and no tab bar", () => {
    setViewport(false)
    render(withQueryClient(<SessionComposer initialActivity="honeycomb" />))

    expect(
      isShown(screen.getByRole("navigation", { name: "Composer steps" }))
    ).toBe(true)
    expect(isDisabled(screen.getByRole("button", { name: "Continue" }))).toBe(
      false
    )
    expect(screen.queryByRole("tablist", { name: "Composer panes" })).toBeNull()
  })
})
