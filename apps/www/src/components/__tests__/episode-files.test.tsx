/**
 * @vitest-environment jsdom
 *
 * An episode's files on its page (ASSETS-R, C1300): a thumbnail home holds
 * is shown with Save; one it made none of offers Generate, which asks home
 * once and says so; chapters home holds none of say they come with the video
 * and offer nothing.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as CallVideosModule from "@/lib/call-videos"
import type {
  AssetRead,
  Produced,
  ShownAsset,
  Step,
  StepState,
} from "@/lib/call-videos/assets"
import type { Episode } from "@/lib/call-videos/model"
import { ASSET_WORDS } from "@/lib/call-videos/words"
import { CONVEYOR_WORDS } from "@/lib/renders/conveyor"
import { WHILE_UNDER_WAY_MS } from "@/lib/renders/model"

/** 2026-11-22T23:05:00Z, in Unix seconds, as home gives it. */
const ASKED_AT = 1795388700

const step = (
  asset: Step["asset"],
  state: StepState,
  over: Partial<Step> = {}
): Step => ({ asset, state, ...over })

const home = vi.hoisted(
  (): {
    reads: Map<string, AssetRead<ShownAsset>>
    produced: Array<string>
    read: Array<string>
    listed: number
  } => ({ reads: new Map(), produced: [], read: [], listed: 0 })
)

vi.mock("@/lib/call-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof CallVideosModule>()
  return {
    ...actual,
    episodeAsset: (
      _feed: string,
      _key: string,
      asset: ShownAsset
    ): Promise<AssetRead<ShownAsset>> => {
      home.read.push(asset)
      return Promise.resolve(home.reads.get(asset) ?? { kind: "none" })
    },
    produceAsset: (
      _feed: string,
      key: string,
      asset: string
    ): Promise<Produced> => {
      home.produced.push(`${key}/${asset}`)
      return Promise.resolve({
        kind: "step",
        step: { asset: "thumbnail", state: "waiting", askedAt: ASKED_AT },
      })
    },
    saveThumbnail: (): Promise<string> => Promise.resolve("opened"),
    readListAgain: (): Promise<null> => {
      home.listed += 1
      return Promise.resolve(null)
    },
  }
})

const { EpisodeFiles } = await import("@/components/episode-files")

const episode = (over: Partial<Episode>): Episode => ({
  key: "2026-11-09",
  videoBytes: 2_000_000,
  restBytes: 10_000,
  link: null,
  receipts: [],
  ...over,
})

const showing = (
  shown: Episode
): { client: QueryClient; rerender: (next: Episode) => void } => {
  const client = new QueryClient()
  const wrap = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { rerender } = render(<EpisodeFiles feed="call" episode={shown} />, {
    wrapper: wrap,
  })
  return {
    client,
    rerender: (next: Episode): void => {
      rerender(<EpisodeFiles feed="call" episode={next} />)
    },
  }
}

const show = (shown: Episode): void => {
  showing(shown)
}

afterEach(() => {
  cleanup()
  home.reads.clear()
  home.produced.length = 0
  home.read.length = 0
  home.listed = 0
  vi.useRealTimers()
})

describe("EpisodeFiles", () => {
  it("shows a thumbnail home holds, with Save", async () => {
    home.reads.set("thumbnail", {
      kind: "there",
      content: { base64: "iVBORw0K" },
    })
    show(episode({}))
    const img = await screen.findByAltText(ASSET_WORDS.thumbnail.alt)
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0K")
    expect(screen.getByRole("button", { name: ASSET_WORDS.save })).toBeTruthy()
  })

  it("asks home once for a thumbnail it made none of, and puts it on the line", async () => {
    show(
      episode({
        assets: {
          thumbnail: step("thumbnail", "missing"),
          description: step("description", "missing"),
        },
      })
    )
    fireEvent.click(
      await screen.findByRole("button", { name: ASSET_WORDS.generate })
    )
    const strip = await screen.findByRole("list", {
      name: ASSET_WORDS.conveyor,
    })
    expect(
      within(strip)
        .getByText(CONVEYOR_WORDS.stations.room)
        .closest("li")
        ?.getAttribute("aria-current")
    ).toBe("step")
    expect(home.produced).toEqual(["2026-11-09/thumbnail"])
    // Chapters come with the video: no Generate of their own.
    expect(screen.getByText(ASSET_WORDS.description.missing)).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: ASSET_WORDS.generate })
    ).toBeNull()
  })

  it("draws a thumbnail in the oven, and chapters home couldn't make beside the line", async () => {
    show(
      episode({
        assets: {
          thumbnail: step("thumbnail", "rendering", { startedAt: ASKED_AT }),
          description: step("description", "failed", { reason: "recorder" }),
        },
      })
    )
    await waitFor(() =>
      expect(
        screen.getAllByRole("list", { name: ASSET_WORDS.conveyor })
      ).toHaveLength(2)
    )
    const [thumbnail] = screen.getAllByRole("list", {
      name: ASSET_WORDS.conveyor,
    })
    expect(
      within(thumbnail)
        .getByText(CONVEYOR_WORDS.stations.oven)
        .closest("li")
        ?.getAttribute("aria-current")
    ).toBe("step")
    expect(screen.getByText(ASSET_WORDS.why.couldNot)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("reads the list again every half minute while a file is on the line, and only then", async () => {
    vi.useFakeTimers()
    const at = (state: StepState): Episode =>
      episode({ assets: { thumbnail: step("thumbnail", state) } })
    const { rerender } = showing(at("waiting"))
    // Not on mount: the page has just read the list.
    expect(home.listed).toBe(0)
    await vi.advanceTimersByTimeAsync(WHILE_UNDER_WAY_MS)
    expect(home.listed).toBe(1)
    rerender(at("failed"))
    await vi.advanceTimersByTimeAsync(3 * WHILE_UNDER_WAY_MS)
    expect(home.listed).toBe(1)
    // On the line again, long after: not at once, then on the interval.
    rerender(at("asked"))
    await vi.advanceTimersByTimeAsync(0)
    expect(home.listed).toBe(1)
    await vi.advanceTimersByTimeAsync(WHILE_UNDER_WAY_MS)
    expect(home.listed).toBe(2)
  })

  it("leaves a drag down's read to the pull, never adding its own", async () => {
    const { client } = showing(
      episode({ assets: { thumbnail: step("thumbnail", "waiting") } })
    )
    await client.refetchQueries({ type: "active" })
    expect(home.listed).toBe(0)
  })

  it("shows nothing of a file an older home neither serves nor lists", async () => {
    show(episode({}))
    await waitFor(() =>
      expect([...home.read].sort()).toEqual(["description", "thumbnail"])
    )
    // Let both reads land before looking.
    await new Promise((settled) => setTimeout(settled, 0))
    expect(screen.queryByRole("heading")).toBeNull()
  })

  it("offers Generate again once the list read after it says not made", async () => {
    const before = episode({
      assets: { thumbnail: step("thumbnail", "missing") },
    })
    const { rerender } = showing(before)
    fireEvent.click(
      await screen.findByRole("button", { name: ASSET_WORDS.generate })
    )
    await screen.findByRole("list", { name: ASSET_WORDS.conveyor })
    // Home dropped the ask: the list read after the answer says not made.
    rerender(episode({ assets: { thumbnail: step("thumbnail", "missing") } }))
    await screen.findByRole("button", { name: ASSET_WORDS.generate })
    expect(
      screen.queryByRole("list", { name: ASSET_WORDS.conveyor })
    ).toBeNull()
  })

  it("reads a file again once home's list says it moved, and shows it", async () => {
    const { rerender } = showing(
      episode({ assets: { thumbnail: step("thumbnail", "rendering") } })
    )
    await screen.findByRole("list", { name: ASSET_WORDS.conveyor })
    home.reads.set("thumbnail", {
      kind: "there",
      content: { base64: "iVBORw0K" },
    })
    rerender(episode({ assets: { thumbnail: step("thumbnail", "done") } }))
    await screen.findByAltText(ASSET_WORDS.thumbnail.alt)
  })
})
