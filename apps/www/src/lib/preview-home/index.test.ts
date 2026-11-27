/**
 * @vitest-environment node
 *
 * Home, as Studio's Previews reads it (HOST16, #3558): each answer of
 * paulgsc/server's `handlers::conversations` (#1245) said in the screen's
 * terms. Family: the list and each conversation's previews read; a home
 * that keeps none (404); an answer this phone can't read; home out of
 * reach; a standing pick, with or without its rule; a pick kept (201), a
 * retried one (200), one refused (409), and one kept that can't be read
 * back.
 */
import { sampleTransitionsOffer } from "@some-ui/video-render"
import type { ConversationEvent } from "@some-ui/video-render"
import { describe, expect, it, vi } from "vitest"

import type { PreviewsAsk } from "@/lib/home-link/preview-reads"
import type { Asked } from "@/lib/home-link/while-busy"
import { CONVERSATIONS_MOST, homePreviews } from "@/lib/preview-home"

const asked = vi.hoisted(
  (): { answers: Array<Asked>; asks: Array<PreviewsAsk> } => ({
    answers: [],
    asks: [],
  })
)

vi.mock("@/lib/home-link/preview-reads", () => ({
  askPreviews: (ask: PreviewsAsk): Promise<Asked> => {
    asked.asks.push(ask)
    return Promise.resolve(asked.answers.shift() ?? { kind: "unreachable" })
  },
}))

const answered = (status: number, body: unknown = ""): Asked => ({
  kind: "answered",
  answer: {
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
  },
})

const OFFER = sampleTransitionsOffer()

const servedPreview = (approved: unknown = null): Record<string, unknown> => ({
  preview: OFFER.preview,
  about: OFFER.about,
  recommended: OFFER.recommended,
  variants: OFFER.variants.map((v) => ({
    ...v,
    video: `/api/v1/conversations/runners/previews/${OFFER.preview}/${v.variant}/video`,
  })),
  approved,
})

const served = (approved: unknown = null): unknown => ({
  previews: [servedPreview(approved)],
  unreadable: ["old-one"],
})

const list = (
  ...conversations: ReadonlyArray<{ id: string; offers: number }>
): unknown => ({
  conversations: conversations.map((c) => ({
    ...c,
    topic: `About ${c.id}`,
    phase: "green-lit",
    standing: 0,
  })),
})

const start = (answers: ReadonlyArray<Asked>): void => {
  asked.answers = [...answers]
  asked.asks = []
}

describe("homePreviews (HOST16)", () => {
  it("reads each conversation that offers previews, newest first, and its standing pick", async () => {
    start([
      answered(
        200,
        list({ id: "runners", offers: 1 }, { id: "quiet", offers: 0 })
      ),
      answered(
        200,
        served({ chose: { kind: "variant", variant: "dip-to-black" } })
      ),
    ])
    const read = await homePreviews.read()
    expect(asked.asks).toEqual([
      { kind: "conversations" },
      { kind: "previews", conversation: "runners" },
    ])
    expect(read).toEqual({
      kind: "read",
      value: {
        unreadable: 0,
        conversations: [
          {
            id: "runners",
            topic: "About runners",
            previews: [
              {
                ...OFFER,
                clips: {},
                standing: {
                  kind: "variant",
                  variant: "dip-to-black",
                  rule: "joins-dip-at-chapters",
                },
              },
            ],
            unshown: 1,
          },
        ],
      },
    })
  })

  it("counts the conversations home couldn't read", async () => {
    start([
      answered(200, {
        conversations: [
          {
            id: "runners",
            topic: "About runners",
            phase: "green-lit",
            offers: 1,
            standing: 0,
          },
        ],
        unreadable: ["broken", "older"],
      }),
      answered(200, served()),
    ])
    const read = await homePreviews.read()
    expect(read.kind === "read" && read.value.unreadable).toBe(2)
  })

  it("reads at most its bound of conversations", async () => {
    const many = Array.from({ length: CONVERSATIONS_MOST + 3 }, (_, i) => ({
      id: `c${String(i)}`,
      offers: 1,
    }))
    start([
      answered(200, list(...many)),
      ...many.map(() => answered(200, served())),
    ])
    const read = await homePreviews.read()
    expect(read.kind === "read" && read.value.conversations).toHaveLength(
      CONVERSATIONS_MOST
    )
  })

  it.each([
    ["a home that keeps no previews yet", [answered(404)], "older"],
    ["an answer it can't read", [answered(200, "{not json")], "unreadable"],
    ["a failing answer", [answered(500)], "unreadable"],
    ["home out of reach", [{ kind: "unreachable" } as const], "away"],
    ["an unpaired phone", [{ kind: "unpaired" } as const], "unpaired"],
  ] as const)("says why it shows nothing: %s", async (_, answers, kind) => {
    start(answers)
    expect((await homePreviews.read()).kind).toBe(kind)
  })

  it("drops only an offer outside the record's bounds, and counts it unshown", async () => {
    start([
      answered(200, list({ id: "runners", offers: 2 })),
      answered(200, {
        previews: [
          servedPreview(),
          { ...servedPreview(), preview: "bad", recommended: "wipe" },
        ],
        unreadable: [],
      }),
    ])
    const read = await homePreviews.read()
    if (read.kind !== "read") throw new Error(read.kind)
    expect(read.value.conversations[0]?.previews.map((p) => p.preview)).toEqual(
      [OFFER.preview]
    )
    expect(read.value.conversations[0]?.unshown).toBe(1)
  })

  const pick: Extract<ConversationEvent, { event: "approve" }> = {
    event: "approve",
    by: "owner",
    at: "2026-11-26T10:00:00.000Z",
    preview: OFFER.preview,
    chose: { kind: "variant", variant: "crossfade" },
  }

  it.each([201, 200])(
    "keeps a pick home answers %s for, and reads the conversation back",
    async (status) => {
      start([
        answered(status, { kept: {}, events: 7 }),
        answered(
          200,
          served({
            chose: {
              kind: "variant",
              variant: "crossfade",
              rule: "joins-crossfade",
            },
          })
        ),
      ])
      const written = await homePreviews.approve("runners", pick)
      expect(asked.asks[0]).toEqual({
        kind: "event",
        conversation: "runners",
        event: pick,
      })
      expect(
        written.kind === "written" && written.value?.previews[0]?.standing
      ).toEqual({
        kind: "variant",
        variant: "crossfade",
        rule: "joins-crossfade",
      })
    }
  )

  it("says an answer it can't read as such, never as refused", async () => {
    start([answered(409, "{not json")])
    expect(await homePreviews.approve("runners", pick)).toEqual({
      kind: "unreadable",
    })
    start([answered(422, {})])
    expect(await homePreviews.approve("runners", pick)).toEqual({
      kind: "unreadable",
    })
  })

  it("reads one conversation again", async () => {
    start([answered(200, served())])
    const again = await homePreviews.reread("runners")
    expect(asked.asks).toEqual([{ kind: "previews", conversation: "runners" }])
    expect(again.kind === "read" && again.value.previews).toHaveLength(1)
  })

  it("says a pick home refused, and one kept that couldn't be read back", async () => {
    start([answered(409, { refused: { why: "preview-again" }, at: 7 })])
    expect(await homePreviews.approve("runners", pick)).toEqual({
      kind: "refused",
    })
    start([answered(201, {}), answered(500)])
    expect(await homePreviews.approve("runners", pick)).toEqual({
      kind: "written",
      value: null,
    })
  })
})
