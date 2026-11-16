/**
 * @vitest-environment jsdom
 *
 * Studio's Episodes, by week (EPISODES2): every feed's episodes under a week
 * heading, each a row opening its own page, a call's parts inline, each
 * opening its part; chips with counts that link to their genre; and a feed
 * that couldn't be read beside the ones that could.
 */
import type { ReactNode } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as CallVideosModule from "@/lib/call-videos"
import type { FeedVideos } from "@/lib/call-videos"
import type {
  Episode,
  Feed,
  ListState,
  VideosState,
} from "@/lib/call-videos/model"
import { FEEDS, INITIAL } from "@/lib/call-videos/model"
import type { Refresher } from "@/lib/pull-refresh/refreshers"

const lists = vi.hoisted((): { state: Map<string, VideosState> } => ({
  state: new Map(),
}))

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

vi.mock("@/lib/build-profile", () => ({ hasAudience: (): boolean => true }))

vi.mock("@/lib/call-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof CallVideosModule>()
  const snapshot = (feed: Feed): VideosState => lists.state.get(feed) ?? INITIAL
  const videos = (feed: Feed): FeedVideos => ({
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot(feed),
    open: () => Promise.resolve(),
    watch: () => Promise.resolve(),
    share: () => Promise.resolve(),
    saveLink: () => Promise.resolve(),
    forget: () => Promise.resolve(),
    seen: () => undefined,
  })
  let last: Record<Feed, ListState> | null = null
  return {
    ...actual,
    feedVideos: videos,
    videosRefresher: (): Refresher => ({
      what: "videos",
      checkAgain: (): Promise<void> => Promise.resolve(),
    }),
    everyFeed: {
      subscribe: (): (() => void) => () => undefined,
      getSnapshot: (): Record<Feed, ListState> => {
        const now = {
          call: snapshot("call").list,
          "cards-essay": snapshot("cards-essay").list,
          "interview-essay": snapshot("interview-essay").list,
          "playoff-delta": snapshot("playoff-delta").list,
          "rust-essay": snapshot("rust-essay").list,
        }
        if (last !== null && FEEDS.every((feed) => last?.[feed] === now[feed]))
          return last
        last = now
        return now
      },
    },
  }
})

const { EpisodesByWeek } = await import("@/components/studio/episodes-by-week")

const episode = (key: string, over: Partial<Episode> = {}): Episode => ({
  key,
  videoBytes: 2_000_000,
  restBytes: 10_000,
  link: null,
  receipts: [],
  ...over,
})

const read = (feed: Feed, episodes: ReadonlyArray<Episode>): void => {
  lists.state.set(feed, { ...INITIAL, list: { kind: "read", episodes } })
}

function readAll(): void {
  read("call", [
    episode("2026-11-06", { week: "2026-11-06", part: 1, of: 2 }),
    episode("2026-11-06-p2", {
      week: "2026-11-06",
      part: 2,
      of: 2,
      link: { url: "https://youtu.be/x", recordedAt: "2026-11-14" },
    }),
  ])
  read("cards-essay", [
    episode("zfs-2026-11-02", { title: "How ZFS snapshots" }),
    episode("nix-2026-11-01", { title: null, videoBytes: null }),
  ])
  read("playoff-delta", [episode("2026-SF-10")])
  read("interview-essay", [episode("2026-w46")])
  read("rust-essay", [])
}

afterEach(() => {
  cleanup()
  lists.state.clear()
})

describe("Studio's Episodes, by week", () => {
  it("lists each episode by its name as a link to its own page", () => {
    readAll()
    render(<EpisodesByWeek chip="all" chips pair={<span />} />)
    expect(
      screen.getByRole("link", { name: /^How ZFS snapshots/ })
    ).toHaveProperty("pathname", "/cards-essay/zfs-2026-11-02")
    expect(
      screen.getByRole("link", { name: /^Nix, as of Sunday, November 1/ })
    ).toHaveProperty("pathname", "/cards-essay/nix-2026-11-01")
  })

  it("groups by week, and lists what nothing dates after", () => {
    readAll()
    render(<EpisodesByWeek chip="all" chips pair={<span />} />)
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      "Week of Nov 9",
      "Week of Nov 2",
      "Week of Oct 26",
      "Not dated yet",
    ])
  })

  it("shows a week's parts on its row, each opening its part", () => {
    readAll()
    render(<EpisodesByWeek chip="call" chips pair={<span />} />)
    expect(screen.getByText("2 parts, 1 on YouTube")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Part 1: On home" })
    ).toHaveProperty("pathname", "/call/2026-11-06")
    expect(
      screen.getByRole("link", { name: "Part 2: On YouTube" })
    ).toHaveProperty("pathname", "/call/2026-11-06-p2")
  })

  it("offers a chip per genre with its count, the chosen one marked", () => {
    readAll()
    render(<EpisodesByWeek chip="cards-essay" chips pair={<span />} />)
    const bar = screen.getByRole("navigation", { name: "Genres" })
    const chips = within(bar).getAllByRole("link")
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "All, 5 videos",
      "Cards essays, 2 videos",
      "Interview essays, 1 video",
      "Playoff Delta, 1 video",
      "Rust Rounds, 0 videos",
      "Weekly call, 1 video",
    ])
    expect(
      within(bar).getByRole("link", { name: "Cards essays, 2 videos" })
    ).toHaveProperty("search", "?genre=cards-essay")
    expect(bar.querySelector("[aria-current=page]")?.textContent).toBe(
      "Cards essays2"
    )
  })

  it("says a genre has none yet in its feed's own words", () => {
    readAll()
    render(<EpisodesByWeek chip="rust-essay" chips pair={<span />} />)
    expect(
      screen.getByText(
        "Home hasn't made an essay yet. Each comes after its week has closed."
      )
    ).toBeTruthy()
  })

  it("says which feed couldn't be read, and shows the rest", () => {
    readAll()
    lists.state.set("call", { ...INITIAL, list: { kind: "away" } })
    render(<EpisodesByWeek chip="all" chips pair={<span />} />)
    expect(
      screen.getByText("The call's videos couldn't be read. The rest are here.")
    ).toBeTruthy()
    expect(
      screen.getByRole("link", { name: /^How ZFS snapshots/ })
    ).toBeTruthy()
  })

  it("asks once for pairing on a phone that isn't paired", () => {
    for (const feed of FEEDS)
      lists.state.set(feed, { ...INITIAL, list: { kind: "unpaired" } })
    render(<EpisodesByWeek chip="all" chips pair={<span>Pair</span>} />)
    expect(
      screen.getByText("Pair this phone with home to see your episodes.")
    ).toBeTruthy()
    expect(screen.queryByRole("navigation")).toBeNull()
  })
})
