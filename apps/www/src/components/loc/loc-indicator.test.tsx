/**
 * @vitest-environment jsdom
 *
 * What the header shows for a snapshot, and that a build without one shows
 * nothing. The arithmetic is `lib/loc-report`'s to test; this is the part
 * between a snapshot and what a person reads.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { LocSnapshot, RepoDay } from "@/lib/loc-report/schema"

import { LocIndicator } from "./loc-indicator"

const lines = (add: number, del = 0, genAdd = 0, genDel = 0): RepoDay => ({
  add,
  del,
  genAdd,
  genDel,
})

const snapshot: LocSnapshot = {
  version: 1,
  generatedAt: "2026-10-03T12:00:00Z",
  through: "2026-10-03",
  repos: ["some-ui", "server"],
  days: [
    { date: "2026-09-10", repos: { "some-ui": lines(1000, 100) } },
    { date: "2026-10-01", repos: { "some-ui": lines(300, 30) } },
    {
      date: "2026-10-03",
      repos: { "some-ui": lines(100, 20, 5000, 4000), server: lines(50, 5) },
    },
  ],
}

beforeAll(() => {
  // Radix sizes its popper with ResizeObserver, which jsdom does not have.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(cleanup)

describe("LocIndicator", () => {
  it("renders nothing when the build carries no snapshot", () => {
    const { container } = render(<LocIndicator snapshot={null} />)
    expect(container.innerHTML).toBe("")
  })

  it("puts the week's added lines on the button", () => {
    render(<LocIndicator snapshot={snapshot} />)
    const button = screen.getByRole("button", { name: /last 7 days/i })
    // Oct 1 and Oct 3 are inside the week; Sep 10 is not.
    expect(button.textContent).toContain("+450")
    expect(button.getAttribute("aria-label")).toContain("450 added")
  })

  it("opens a breakdown that follows the range and the switch", () => {
    render(<LocIndicator snapshot={snapshot} />)
    fireEvent.click(screen.getByRole("button", { name: /last 7 days/i }))

    const dialog = screen.getByRole("dialog", { name: /lines of code/i })
    expect(within(dialog).getByText("+450")).toBeDefined()
    expect(within(dialog).getByText(/added in the last 7 days/i)).toBeDefined()
    // Dated, not "live": the numbers are as old as the build.
    expect(within(dialog).getByText(/as of oct 3/i)).toBeDefined()
    expect(within(dialog).getByText("some-ui")).toBeDefined()
    expect(within(dialog).getByText("server")).toBeDefined()

    fireEvent.click(within(dialog).getByRole("button", { name: "90d" }))
    expect(within(dialog).getByText("+1,450")).toBeDefined()
    expect(within(dialog).getByText(/added in the last 90 days/i)).toBeDefined()

    // The switch starts on (ignoring generated files); off brings them in.
    fireEvent.click(
      within(dialog).getByRole("switch", {
        name: /ignore lockfiles and generated code/i,
      })
    )
    expect(within(dialog).getByText("+6,450")).toBeDefined()
  })
})
