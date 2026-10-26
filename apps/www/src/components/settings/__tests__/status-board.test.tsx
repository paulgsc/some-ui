/**
 * @vitest-environment jsdom
 *
 * The status page (#2165): one glance mark per process, the ones that need
 * their person lifted into "Needs you", every row a way to the page that
 * owns it, and no Korean row on a phone with no home to look at. What each
 * row says is its surface's own (`laneView`, `morningOf`, `lastLook`), held
 * by their tests; the order is `lib/status-board`'s.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EMPTY } from "@/lib/jobs/model"
import type { BoardRow } from "@/lib/status-board"
import { BOARD_WORDS } from "@/lib/status-board/words"
import { StatusBoard } from "@/components/settings/status-board"

const sources = vi.hoisted((): { lanes: Array<unknown>; look: unknown } => ({
  lanes: [],
  look: null,
}))

vi.mock("@/components/settings/device-sharing-ledger", () => ({
  useLaneRows: (): Array<unknown> => sources.lanes,
}))
vi.mock("@/components/settings/device-routine-reads", () => ({
  useLookRow: (): unknown => sources.look,
}))
vi.mock("@/components/jobs/parts", () => ({
  useJobs: (): unknown => ({ state: EMPTY }),
}))
vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (audience: string): boolean => audience === "apk",
}))
vi.mock("@/lib/clock", () => ({
  useMinuteClock: (): Date => new Date("2026-10-26T18:00:00Z"),
}))
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

afterEach(cleanup)

const lane = (
  id: string,
  how: "current" | "unpaired",
  page: BoardRow["page"]
): BoardRow => ({
  id,
  group: "home",
  name: id,
  word: how,
  line: `${id} line`,
  more: [],
  mark: { kind: "lane", where: "kept", how },
  page,
})

describe("StatusBoard", () => {
  it("lifts what needs you, glances at every row, and links each to its page", () => {
    sources.lanes = [
      lane("Practice", "current", "practice"),
      lane("Voice notes", "unpaired", "home-settings"),
    ]
    sources.look = {
      id: "korean-look",
      group: "korean",
      name: "Korean's look at home",
      word: "Looked",
      line: "Last looked",
      more: [],
      mark: { kind: "look", look: "read" },
      page: "home-settings",
    }
    render(<StatusBoard />)
    const glance = screen.getByRole("region", { name: BOARD_WORDS.glance })
    // The two lanes, the morning run and Korean's look.
    expect(within(glance).getAllByRole("listitem")).toHaveLength(4)
    // The plain-link stub keeps `to`, as the page names where each row goes.
    const links = (name: string): Array<[string | null, string | null]> =>
      [...screen.getByRole("region", { name }).querySelectorAll("a")].map(
        (a) => [a.getAttribute("aria-label"), a.getAttribute("to")]
      )
    // Voice notes on an unpaired phone, and today's picks waiting in Drive.
    const lifted = links(BOARD_WORDS.needsYou)
    expect(lifted.map(([, to]) => to)).toEqual(["/settings/home", "/jobs"])
    expect(lifted[0]?.[0]).toMatch(/^Voice notes: open/)
    expect(links(BOARD_WORDS.groups.home)).toEqual([
      [expect.stringMatching(/^Practice: open/), "/practice"],
    ])
    expect(links(BOARD_WORDS.groups.korean)).toHaveLength(1)
  })

  it("shows no Korean row where there is no home to look at", () => {
    sources.lanes = [lane("Practice", "current", "practice")]
    sources.look = null
    render(<StatusBoard />)
    expect(
      screen.queryByRole("region", { name: BOARD_WORDS.groups.korean })
    ).toBeNull()
  })
})
