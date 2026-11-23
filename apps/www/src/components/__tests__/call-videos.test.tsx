/**
 * @vitest-environment jsdom
 *
 * Studio's Episodes plays a done cards essay from home, named by the title
 * home gives it, with its YouTube link to save as every feed's episode takes
 * one (#2999).
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as CallVideosModule from "@/lib/call-videos"
import type { FeedVideos } from "@/lib/call-videos"
import type { AssetRead, ShownAsset } from "@/lib/call-videos/assets"
import type { Episode, Feed, VideosState } from "@/lib/call-videos/model"
import { INITIAL } from "@/lib/call-videos/model"
import type { Refresher } from "@/lib/pull-refresh/refreshers"

const lists = vi.hoisted(
  (): {
    state: Map<string, VideosState>
    watched: Array<string>
  } => ({ state: new Map(), watched: [] })
)

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
  }: {
    children: ReactNode
    params: { feed: string; key: string }
  }): ReactNode => <a href={`/${params.feed}/${params.key}`}>{children}</a>,
}))

vi.mock("@/lib/build-profile", () => ({ hasAudience: (): boolean => true }))

vi.mock("@/components/studio/episode-feedback", () => ({
  EpisodeNote: (): ReactNode => null,
}))

vi.mock("@/lib/call-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof CallVideosModule>()
  const videos = (feed: Feed): FeedVideos => ({
    subscribe: () => () => undefined,
    getSnapshot: () => lists.state.get(feed) ?? INITIAL,
    open: () => Promise.resolve(),
    watch: (key): Promise<void> => {
      lists.watched.push(`${feed}/${key}`)
      return Promise.resolve()
    },
    share: () => Promise.resolve(),
    saveLink: () => Promise.resolve(),
    forget: () => Promise.resolve(),
    seen: () => undefined,
  })
  return {
    ...actual,
    feedVideos: videos,
    videosRefresher: (): Refresher => ({
      what: "videos",
      checkAgain: (): Promise<void> => Promise.resolve(),
    }),
    episodeAsset: (): Promise<AssetRead<ShownAsset>> =>
      Promise.resolve({ kind: "none" }),
  }
})

const { EpisodeScreen } = await import("@/components/call-videos")

const episode = (over: Partial<Episode>): Episode => ({
  key: "zfs-2026-11-02",
  videoBytes: 2_000_000,
  restBytes: 10_000,
  link: null,
  receipts: [],
  ...over,
})

const read = (
  feed: Feed,
  episodes: ReadonlyArray<Episode>,
  over: Partial<VideosState> = {}
): void => {
  lists.state.set(feed, {
    ...INITIAL,
    list: { kind: "read", episodes },
    ...over,
  })
}

function draw(node: ReactNode): void {
  const client = new QueryClient()
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  lists.state.clear()
  lists.watched.length = 0
})

describe("a cards essay in Studio's Episodes", () => {
  it("brings a done essay from home to watch, with its link to save", () => {
    read("cards-essay", [episode({ title: "How ZFS snapshots" })])
    draw(
      <EpisodeScreen
        feed="cards-essay"
        episodeKey="zfs-2026-11-02"
        pair={<span />}
      />
    )
    expect(
      screen.getByRole("heading", { name: "How ZFS snapshots" })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /watch/i }))
    expect(lists.watched).toEqual(["cards-essay/zfs-2026-11-02"])
    expect(screen.getByLabelText("Its YouTube link")).toBeTruthy()
  })

  it("says an essay home is still making is waiting", () => {
    read("cards-essay", [episode({ videoBytes: null })])
    draw(
      <EpisodeScreen
        feed="cards-essay"
        episodeKey="zfs-2026-11-02"
        pair={<span />}
      />
    )
    expect(
      screen.getByText("Home is still making this essay's video.")
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: /watch/i })).toBeNull()
  })
})
