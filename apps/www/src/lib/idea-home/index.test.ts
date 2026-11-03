/**
 * @vitest-environment node
 *
 * Home, as Ideas on home reads it (ST26 (c)): each answer of
 * `handlers::ideas` said in the screen's terms, and a busy link asked again.
 */
import { describe, expect, it, vi } from "vitest"

import type { IdeasAsk, IdeasAsked } from "@/lib/home-link/idea-reads"
import { ideasHome } from "@/lib/idea-home"

const asked = vi.hoisted(
  (): { answers: Array<IdeasAsked>; asks: Array<IdeasAsk> } => ({
    answers: [],
    asks: [],
  })
)

vi.mock("@/lib/home-link/idea-reads", () => ({
  askIdeas: (ask: IdeasAsk): Promise<IdeasAsked> => {
    asked.asks.push(ask)
    return Promise.resolve(asked.answers.shift() ?? { kind: "unreachable" })
  },
}))

const answered = (status: number, body: unknown = ""): IdeasAsked => ({
  kind: "answered",
  answer: {
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
  },
})

const IDEA = {
  id: "i1",
  createdAt: "2026-11-01T09:00:00.000Z",
  revision: 1,
  sentAt: "2026-11-01T09:10:00.000Z",
  title: "Why the mic clips",
  topic: "Studio",
  format: "short",
  keywords: [],
  questions: 1,
  answers: [
    {
      question: "what",
      note: "n1",
      typed: null,
      heard: {
        text: "…",
        language: "en",
        model: "ggml-base.en.bin",
        heardAt: "2026-11-01T09:11:02.000Z",
      },
      setAside: false,
    },
  ],
  furnishing: false,
  setAside: false,
}

describe("Ideas on home's reads of home (ST26 c)", () => {
  it("reads the ideas, and says a home without the route keeps none yet", async () => {
    asked.answers = [answered(200, { ideas: [IDEA], more: false })]
    const read = await ideasHome.ideas()
    expect(
      read.kind === "read" && read.value.ideas[0]?.answers[0]?.heard
    ).toEqual({
      text: "…",
      heardAt: "2026-11-01T09:11:02.000Z",
    })
    asked.answers = [answered(404)]
    expect(await ideasHome.ideas()).toEqual({ kind: "older" })
    asked.answers = [answered(200, { ideas: [{ id: "i1" }] })]
    expect(await ideasHome.ideas()).toEqual({ kind: "unreadable" })
    asked.answers = [{ kind: "unpaired" }]
    expect(await ideasHome.lists()).toEqual({ kind: "unpaired" })
    asked.answers = []
    expect(await ideasHome.lists()).toEqual({ kind: "away" })
  })

  it("asks again while the link is busy", async () => {
    vi.useFakeTimers()
    asked.asks = []
    asked.answers = [
      { kind: "busy" },
      answered(200, { topics: ["Studio"], keywords: [] }),
    ]
    const lists = ideasHome.lists()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await lists).toEqual({
      kind: "read",
      value: { topics: ["Studio"], keywords: [] },
    })
    expect(asked.asks).toEqual([{ kind: "lists" }, { kind: "lists" }])
    vi.useRealTimers()
  })

  it("writes a mark or an entry, and says home's answer as it now stands", async () => {
    asked.answers = [answered(200, { change: "added", furnishing: true })]
    expect(await ideasHome.furnish("i1", true)).toEqual({
      kind: "written",
      value: true,
    })
    asked.answers = [answered(204)]
    expect(await ideasHome.setAside("i1")).toEqual({
      kind: "written",
      value: null,
    })
    asked.answers = [answered(404)]
    expect(await ideasHome.setAside("i1")).toEqual({ kind: "refused" })
    const lists = { topics: ["Studio"], keywords: ["phone"] }
    asked.answers = [answered(200, { change: "added", ...lists })]
    expect(await ideasHome.entry("keywords", "phone", true)).toEqual({
      kind: "written",
      value: lists,
    })
    asked.answers = [answered(422)]
    expect(await ideasHome.entry("keywords", "x/y", true)).toEqual({
      kind: "refused",
    })
  })
})
