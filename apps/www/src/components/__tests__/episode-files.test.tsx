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
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as CallVideosModule from "@/lib/call-videos"
import type { AssetRead, Produced, ShownAsset } from "@/lib/call-videos/assets"
import type { Episode } from "@/lib/call-videos/model"
import { ASSET_WORDS } from "@/lib/call-videos/words"

const home = vi.hoisted(
  (): {
    reads: Map<string, AssetRead<ShownAsset>>
    produced: Array<string>
  } => ({ reads: new Map(), produced: [] })
)

vi.mock("@/lib/call-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof CallVideosModule>()
  return {
    ...actual,
    episodeAsset: (
      _feed: string,
      _key: string,
      asset: ShownAsset
    ): Promise<AssetRead<ShownAsset>> =>
      Promise.resolve(home.reads.get(asset) ?? { kind: "none" }),
    produceAsset: (
      _feed: string,
      key: string,
      asset: string
    ): Promise<Produced> => {
      home.produced.push(`${key}/${asset}`)
      return Promise.resolve({ kind: "asked" })
    },
    saveThumbnail: (): Promise<boolean> => Promise.resolve(true),
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

const show = (shown: Episode): void => {
  const client = new QueryClient()
  const wrap = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<EpisodeFiles feed="call" episode={shown} />, {
    wrapper: wrap,
  })
}

afterEach(() => {
  cleanup()
  home.reads.clear()
  home.produced.length = 0
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

  it("asks home once for a thumbnail it made none of, and says so", async () => {
    show(episode({ assets: { thumbnail: "missing", description: "missing" } }))
    fireEvent.click(
      await screen.findByRole("button", { name: ASSET_WORDS.generate })
    )
    await screen.findByText(ASSET_WORDS.produced.asked)
    expect(home.produced).toEqual(["2026-11-09/thumbnail"])
    // Chapters come with the video: no Generate of their own.
    expect(screen.getByText(ASSET_WORDS.description.missing)).toBeTruthy()
    expect(
      screen.getAllByRole("button", { name: ASSET_WORDS.generate })
    ).toHaveLength(1)
  })

  it("says a thumbnail asked for is coming, and one home couldn't make", async () => {
    show(episode({ assets: { thumbnail: "queued", description: "failed" } }))
    await screen.findByText(ASSET_WORDS.thumbnail.asked)
    expect(screen.getByText(ASSET_WORDS.description.failed)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows nothing of a file an older home neither serves nor lists", async () => {
    show(episode({}))
    await waitFor(() => expect(screen.queryByRole("heading")).toBeNull())
  })
})
