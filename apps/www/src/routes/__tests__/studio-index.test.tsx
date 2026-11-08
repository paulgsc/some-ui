/**
 * @vitest-environment jsdom
 *
 * Studio's index on the phone (SFEED1, #2731): it opens on the eight kinds,
 * A to Z, each a link to its own page, and with no video in the making
 * first; a template's page shows its pinned shape; and Asks lists what the
 * open `ask` issues ask, opening each one's page.
 */
import { Route as IndexRoute } from "@/routes/_dashboard/_apk/journal/index"
import {
  createTestQueryClient,
  withQueryClient,
} from "@/test-support/query-client"
import { routeComponent } from "@/test-support/router-stubs"
import { templateFormat } from "@some-ui/video-render"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
  STUDIO_KINDS,
} from "@/lib/studio-index"
import { AsksList } from "@/components/studio/asks"
import { ClipScreen, ClipsList } from "@/components/studio/clips"
import { TemplateShape } from "@/components/studio/template"

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const { withPlainLink } = await import("@/test-support/router-stubs")
  return withPlainLink(await importOriginal<typeof ReactRouterModule>())
})

// Studio's pages are the phone's: links to them draw only where it is.
vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (audience: string): boolean => audience === "apk",
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Studio's index", () => {
  it("opens on the eight kinds, A to Z, each linking to its page", () => {
    const Index = routeComponent(IndexRoute)
    render(<Index />)
    // The stand-in `Link` is an `<a>` with `to`, so it has no link role.
    const tiles = [
      ...within(screen.getAllByRole("list")[0])
        .getAllByRole("listitem")
        .map((item) => item.querySelector("a")!),
    ]
    expect(tiles.map((tile) => tile.getAttribute("to"))).toEqual(
      STUDIO_KINDS.map((kind) => `/journal/${kind}`)
    )
    expect(tiles.map((tile) => tile.textContent)).toEqual(
      STUDIO_KINDS.map(
        (kind) => `${KIND_WORDS[kind].name}${KIND_WORDS[kind].line}`
      )
    )
    expect(screen.getByText(STUDIO_INDEX_WORDS.myData).getAttribute("to")).toBe(
      "/settings/data"
    )
  })
})

describe("a template's page", () => {
  it("shows the call's shape: the intro, the brand, every section, the chapters", () => {
    const format = templateFormat("conference-call")
    render(<TemplateShape format={format} />)
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent)
    const W = STUDIO_INDEX_WORDS.templates
    expect(rows[0]).toContain(W.who)
    expect(rows[1]).toContain(W.brandIn)
    expect(rows.at(-1)).toContain(W.brandOut)
    for (const scene of format.scenes)
      expect(rows.some((row) => row.startsWith(scene.name))).toBe(true)
    expect(rows.filter((row) => row.includes(W.chapter))).toHaveLength(
      format.shape?.chapters.length ?? -1
    )
    screen.getByText(W.captioned.word)
  })
})

const issue = (number: number, question: string): object => ({
  number,
  title: `[ASK] ${question}`,
  html_url: `https://github.com/paulgsc/some-ui/issues/${String(number)}`,
  body: [
    "```json ask",
    JSON.stringify({
      schema: "some-ui.ask/1",
      question,
      whyYours: "Only you decide it.",
      options: [
        { says: "Yes", unblocks: "the next story" },
        { says: "Not yet", unblocks: "nothing" },
      ],
    }),
    "```",
  ].join("\n"),
})

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

describe("Asks", () => {
  it("lists both repositories' open asks, each a link to its page", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) =>
        Promise.resolve(
          answer(
            String(input).includes("/server/")
              ? [issue(9, "Redeploy home?")]
              : [
                  issue(2673, "Which music under the voice?"),
                  issue(1, "Answer between turns?"),
                ]
          )
        )
      )
    const { container } = render(withQueryClient(<AsksList />))
    await screen.findByText("Redeploy home?")
    const links = [...container.querySelectorAll("a")]
    expect(links).toHaveLength(3)
    for (const link of links)
      expect(link.getAttribute("to")).toBe("/journal/asks/$ask")
    expect(fetch).toHaveBeenCalledTimes(2)
    screen.getByText(STUDIO_INDEX_WORDS.asks.from.server)
  })

  it("keeps what was read when a refresh fails, and says so", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        Promise.resolve(answer([issue(9, "Redeploy home?")]))
      )
      .mockImplementationOnce(() => Promise.resolve(answer([])))
      .mockResolvedValue(new Response("rate limited", { status: 403 }))
    const client = createTestQueryClient()
    render(withQueryClient(<AsksList />, client))
    await screen.findByText("Redeploy home?")
    await act(() => client.refetchQueries())
    await screen.findByText(STUDIO_INDEX_WORDS.asks.stale)
    screen.getByText("Redeploy home?")
  })

  it("says so when they can't be read, with a way to try again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 403 })
    )
    render(withQueryClient(<AsksList />))
    await screen.findByText(STUDIO_INDEX_WORDS.asks.away)
    screen.getByRole("button", { name: STUDIO_INDEX_WORDS.tryAgain })
  })
})

/** paulgsc/testing's host serves a JSON file as plain text. */
const asText = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })

const CLIP = {
  id: "never-suspend",
  title: "Never suspend a site, from the popup",
  app: "suspender-ledger",
  change: { repo: "some-ui", kind: "pr", number: 2600 },
  landed: "2026-11-01",
  before: null,
  after: {
    made: "walk",
    snips: [
      { file: "after/snips/01.png", label: "The popup opens" },
      { file: "after/snips/02.png", label: "Never suspend this site" },
    ],
  },
}

describe("the Library", () => {
  it("lists every clip kept, each a link to its page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      asText({ schema: "some-ui.clip-index/1", clips: [CLIP] })
    )
    const { container } = render(withQueryClient(<ClipsList />))
    await screen.findByText(CLIP.title)
    expect(container.querySelector("a")?.getAttribute("to")).toBe(
      "/journal/clips/$clip"
    )
  })

  it("is empty, not failed, before testing keeps any clip", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("404: Not Found", { status: 404 })
    )
    render(withQueryClient(<ClipsList />))
    await screen.findByText(STUDIO_INDEX_WORDS.clips.none)
  })

  it("shows a clip's after step by step, and that nothing came before", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      asText({ schema: "some-ui.clip-index/1", clips: [CLIP] })
    )
    render(withQueryClient(<ClipScreen id={CLIP.id} />))
    await screen.findByText(STUDIO_INDEX_WORDS.clips.nothingBefore)
    const shots = screen.getAllByRole("img")
    expect(shots.map((img) => img.getAttribute("alt"))).toEqual(
      CLIP.after.snips.map((snip) => snip.label)
    )
    expect(shots[0]?.getAttribute("src")).toBe(
      "https://raw.githubusercontent.com/paulgsc/testing/main/clips/never-suspend/after/snips/01.png"
    )
  })
})
