/**
 * @vitest-environment jsdom
 *
 * Studio's Episodes, by week (EPISODES2): every feed's episodes under a week
 * heading, each a row opening its own page, a call's parts inline, each
 * opening its part, and chips with counts that link to their genre. What
 * `feedView` decides is its own test's (`lib/episodes-feed`); this draws it.
 */
import type { ReactNode } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Episode } from "@/lib/call-videos/model"
import type { Chip, FeedLists } from "@/lib/episodes-feed"
import { feedView } from "@/lib/episodes-feed"
import { EpisodesView } from "@/components/studio/episodes-by-week"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    "aria-label": label,
    "aria-current": current,
  }: {
    children: ReactNode
    params?: { feed: string; key: string }
    search?: { genre?: string }
    "aria-label"?: string
    "aria-current"?: "page"
  }): ReactNode => (
    <a
      href={
        params === undefined
          ? `/episodes${search?.genre === undefined ? "" : `?genre=${search.genre}`}`
          : `/${params.feed}/${params.key}`
      }
      aria-label={label}
      aria-current={current}
    >
      {children}
    </a>
  ),
}))

const episode = (key: string, over: Partial<Episode> = {}): Episode => ({
  key,
  videoBytes: 2_000_000,
  restBytes: 10_000,
  link: null,
  receipts: [],
  ...over,
})

const LISTS: FeedLists = {
  call: {
    kind: "read",
    episodes: [
      episode("2026-11-06", { week: "2026-11-06", part: 1, of: 2 }),
      episode("2026-11-06-p2", {
        week: "2026-11-06",
        part: 2,
        of: 2,
        link: { url: "https://youtu.be/x", recordedAt: "2026-11-14" },
      }),
    ],
  },
  "cards-essay": {
    kind: "read",
    episodes: [
      episode("zfs-2026-11-02", { title: "How ZFS snapshots" }),
      episode("nix-2026-11-01", { title: null, videoBytes: null }),
    ],
  },
  "interview-essay": { kind: "read", episodes: [episode("2026-w46")] },
  "playoff-delta": { kind: "read", episodes: [episode("2026-SF-10")] },
  "rust-essay": { kind: "read", episodes: [] },
}

function draw(chip: Chip): void {
  render(
    <EpisodesView
      view={feedView(LISTS, chip)}
      chip={chip}
      chips
      pair={<span />}
      thisMonday="2026-11-09"
      onTryAgain={() => undefined}
    />
  )
}

afterEach(cleanup)

describe("Studio's Episodes, by week", () => {
  it("lists each episode by its name as a link to its own page", () => {
    draw("all")
    expect(
      screen.getByRole("link", { name: /^How ZFS snapshots/ })
    ).toHaveProperty("pathname", "/cards-essay/zfs-2026-11-02")
    expect(
      screen.getByRole("link", { name: /^Nix, as of Sunday, November 1/ })
    ).toHaveProperty("pathname", "/cards-essay/nix-2026-11-01")
  })

  it("groups by week, and lists what nothing dates after", () => {
    draw("all")
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      "This week",
      "Week of Nov 2",
      "Week of Oct 26",
      "Not dated yet",
    ])
  })

  it("shows a week's parts on its row, each opening its part", () => {
    draw("call")
    expect(screen.getByText("2 parts, 1 on YouTube")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Part 1: On home" })
    ).toHaveProperty("pathname", "/call/2026-11-06")
    expect(
      screen.getByRole("link", { name: "Part 2: On YouTube" })
    ).toHaveProperty("pathname", "/call/2026-11-06-p2")
  })

  it("offers a chip per genre with its count, the chosen one marked", () => {
    draw("cards-essay")
    const bar = screen.getByRole("navigation", { name: "Genres" })
    const chips = within(bar).getAllByRole("link")
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "All, 5 episodes",
      "Cards essays, 2 episodes",
      "Interview essays, 1 episode",
      "Playoff Delta, 1 episode",
      "Rust Rounds, 0 episodes",
      "Weekly call, 1 episode",
    ])
    expect(
      within(bar).getByRole("link", { name: "Cards essays, 2 episodes" })
    ).toHaveProperty("search", "?genre=cards-essay")
    expect(bar.querySelector("[aria-current=page]")?.textContent).toBe(
      "Cards essays2"
    )
  })

  it("says a genre has none yet in its feed's own words", () => {
    draw("rust-essay")
    expect(
      screen.getByText(
        "Home hasn't made an essay yet. Each comes after its week has closed."
      )
    ).toBeTruthy()
  })
})
