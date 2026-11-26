/**
 * @vitest-environment jsdom
 *
 * HOST16 (#3558): only a variant's "Use this" picks, never its clip; the
 * pick goes where picks are kept and the screen says what it came to; using
 * another later is a new pick that moves the earlier one; something else
 * takes the owner's words; the sample says it keeps nothing; and when home
 * can't be read, the screen says why and asks again.
 */
import type { HomeWrite } from "@some-ui/soundbites"
import type { ConversationEvent } from "@some-ui/video-render"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PICK_WORDS, previewsRuntime, sampleSource } from "@/lib/preview-pick"
import type { ConversationPreviews, PreviewSource } from "@/lib/preview-pick"
import { Previews } from "@/components/studio/preview-pick"

afterEach(cleanup)

const AT = "2026-11-26T10:00:00.000Z"
const OFFER = sampleTransitionsOffer()

/** A home that keeps every pick it is sent, as its record would. */
function keepingHome(
  clipped: ReadonlyArray<string> = OFFER.variants.map((v) => v.variant)
): {
  readonly source: PreviewSource
  readonly sent: Array<Extract<ConversationEvent, { event: "approve" }>>
} {
  const sent: Array<Extract<ConversationEvent, { event: "approve" }>> = []
  let standing: ConversationPreviews["previews"][number]["standing"] = null
  const now = (): ConversationPreviews => ({
    id: "runners",
    topic: "The runners",
    previews: [
      {
        ...OFFER,
        clips: Object.fromEntries(clipped.map((v) => [v, `/${v}.mp4`])),
        standing,
      },
    ],
    unshown: 0,
  })
  return {
    sent,
    source: {
      where: "home",
      read: () => Promise.resolve({ kind: "read", value: [now()] }),
      approve: (_c, event): Promise<HomeWrite<ConversationPreviews | null>> => {
        sent.push(event)
        const { chose } = event
        standing =
          chose.kind === "else"
            ? chose
            : {
                kind: "variant",
                variant: chose.variant,
                rule:
                  OFFER.variants.find((v) => v.variant === chose.variant)
                    ?.rule ?? "",
              }
        return Promise.resolve({ kind: "written", value: now() })
      },
    },
  }
}

async function drawn(source: PreviewSource): Promise<void> {
  const runtime = previewsRuntime(source, () => AT)
  render(<Previews previews={runtime} />)
  await act(async () => {
    runtime.open()
    await Promise.resolve()
  })
}

/** Each variant's Use this, in the order offered. */
const useButtons = (): Array<HTMLElement> =>
  screen.getAllByRole("button", { name: new RegExp(PICK_WORDS.use) })

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

describe("Previews (HOST16)", () => {
  it("shows each variant with what's in it, one recommended, its clip muted and looping", async () => {
    await drawn(keepingHome([OFFER.recommended]).source)
    expect(useButtons()).toHaveLength(2)
    expect(screen.getByText("New chapter: dip to black")).toBeTruthy()
    expect(screen.getByText(PICK_WORDS.recommended)).toBeTruthy()
    const video = document.querySelector("video")
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(screen.getByText(new RegExp(PICK_WORDS.noClip))).toBeTruthy()
  })

  it("holds a home variant's Use this until its clip plays here, and not the sample's", async () => {
    const home = keepingHome([OFFER.recommended])
    await drawn(home.source)
    const [crossfade, dip] = useButtons()
    expect(crossfade.hasAttribute("disabled")).toBe(false)
    expect(dip.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(new RegExp(PICK_WORDS.watchFirst))).toBeTruthy()
    // Something else is still the owner's to say.
    expect(
      screen
        .getByText(PICK_WORDS.own)
        .closest("button")
        ?.hasAttribute("disabled")
    ).toBe(false)
    cleanup()
    await drawn(sampleSource())
    expect(useButtons().every((b) => !b.hasAttribute("disabled"))).toBe(true)
    expect(screen.queryByText(new RegExp(PICK_WORDS.watchFirst))).toBeNull()
  })

  it("picks nothing on a tap of the clip or its card: only Use this picks", async () => {
    const home = keepingHome()
    await drawn(home.source)
    const video = document.querySelector("video")
    if (video === null) throw new Error("no clip")
    fireEvent.click(video)
    fireEvent.click(screen.getByText("Dip to black"))
    fireEvent.click(screen.getByText("New chapter: dip to black"))
    expect(home.sent).toEqual([])
    expect(screen.getByText(PICK_WORDS.none)).toBeTruthy()
  })

  it("keeps a pick on home and says so, and sends a change as a move", async () => {
    const home = keepingHome()
    await drawn(home.source)
    const [, dip] = useButtons()
    fireEvent.click(dip)
    await settle()
    expect(screen.getByText(PICK_WORDS.picked.home)).toBeTruthy()
    expect(useButtons()[1]?.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(useButtons()[1])
    expect(screen.getByText(PICK_WORDS.already)).toBeTruthy()
    fireEvent.click(useButtons()[0])
    await settle()
    expect(home.sent.map((e) => [e.chose, e.moves])).toEqual([
      [{ kind: "variant", variant: "dip-to-black" }, undefined],
      [{ kind: "variant", variant: "crossfade" }, OFFER.preview],
    ])
    expect(useButtons()[0]?.getAttribute("aria-pressed")).toBe("true")
  })

  it("says the same words again when they are earned again", async () => {
    await drawn(keepingHome().source)
    fireEvent.click(useButtons()[1])
    await settle()
    fireEvent.click(useButtons()[1])
    const first = screen.getByText(PICK_WORDS.already)
    fireEvent.click(useButtons()[1])
    expect(screen.getByText(PICK_WORDS.already)).not.toBe(first)
  })

  it("asks for something else in the owner's words, and sends them", async () => {
    const home = keepingHome()
    await drawn(home.source)
    fireEvent.click(screen.getByText(PICK_WORDS.own))
    fireEvent.change(screen.getByLabelText(PICK_WORDS.ownPrompt), {
      target: { value: "Softer, like a page turning." },
    })
    fireEvent.click(screen.getByText(PICK_WORDS.ownSend))
    await settle()
    expect(home.sent[0]?.chose).toEqual({
      kind: "else",
      said: "Softer, like a page turning.",
    })
  })

  it("says the sample keeps nothing", async () => {
    await drawn(sampleSource())
    expect(screen.getByText(PICK_WORDS.sample)).toBeTruthy()
    fireEvent.click(useButtons()[1])
    await settle()
    expect(screen.getByText(PICK_WORDS.picked.sample)).toBeTruthy()
  })

  it("says why home's previews aren't shown, and asks again on Try again", async () => {
    let reads = 0
    const away: PreviewSource = {
      where: "home",
      read: () => {
        reads += 1
        return Promise.resolve({ kind: "away" })
      },
      approve: () => Promise.resolve({ kind: "away" }),
    }
    await drawn(away)
    expect(screen.getByText(PICK_WORDS.nothing.away)).toBeTruthy()
    fireEvent.click(screen.getByText(PICK_WORDS.again))
    await settle()
    expect(reads).toBe(2)
  })
})
