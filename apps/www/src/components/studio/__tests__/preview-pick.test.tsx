/**
 * @vitest-environment jsdom
 *
 * HOST16 (#3558): only a variant's "Use this" picks, never its clip; the
 * pick is kept as the record's approval, saying where; using another later
 * is a new pick that moves the earlier one, both kept; something else takes
 * the owner's words; a sample's picks are held in memory and never kept.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  phonePicks,
  PICK_WORDS,
  PICKS_KEY,
  samplePicks,
} from "@/lib/preview-pick"
import type { PreviewPicks } from "@/lib/preview-pick"
import { PreviewPick } from "@/components/studio/preview-pick"

afterEach(cleanup)

const AT = "2026-11-26T10:00:00.000Z"

/** Each variant's Use this, in the order offered. */
const useButtons = (): Array<HTMLElement> =>
  screen.getAllByRole("button", { name: new RegExp(PICK_WORDS.use) })

const drawn = (
  storage: KeyedStorage,
  picks: PreviewPicks = phonePicks(() => storage)
): PreviewPicks => {
  render(
    <PreviewPick
      offer={sampleTransitionsOffer()}
      conversation="runners"
      picks={picks}
      clipSrc={(v) => (v.variant === "crossfade" ? "/clip.mp4" : null)}
      now={() => AT}
    />
  )
  return picks
}

describe("PreviewPick (HOST16)", () => {
  it("shows each variant with what's in it, one recommended, its clip muted and looping", () => {
    drawn(inMemoryStorage())
    expect(screen.getAllByText(PICK_WORDS.use)).toHaveLength(2)
    expect(screen.getByText("New chapter: dip to black")).toBeTruthy()
    expect(screen.getByText(PICK_WORDS.recommended)).toBeTruthy()
    const video = document.querySelector("video")
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(screen.getByText(PICK_WORDS.noClip)).toBeTruthy()
  })

  it("picks nothing on a tap of the clip or its card: only Use this picks", () => {
    const picks = drawn(inMemoryStorage())
    fireEvent.click(document.querySelector("video")!)
    fireEvent.click(screen.getByText("Dip to black"))
    fireEvent.click(screen.getByText("New chapter: dip to black"))
    expect(picks.list("runners")).toEqual([])
    expect(screen.getByText(PICK_WORDS.none)).toBeTruthy()
  })

  it("keeps a pick as the record's approval, says where, and keeps a change as a move", () => {
    const storage = inMemoryStorage()
    const picks = drawn(storage)
    const [crossfade, dip] = useButtons()
    fireEvent.click(dip)
    expect(screen.getByText(PICK_WORDS.kept.phone)).toBeTruthy()
    expect(dip.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(dip)
    expect(screen.getByText(PICK_WORDS.already)).toBeTruthy()
    fireEvent.click(crossfade)
    const kept = picks.list("runners") ?? []
    expect(kept.map((p) => [p.event.chose, p.event.moves])).toEqual([
      [
        {
          kind: "variant",
          variant: "dip-to-black",
        },
        undefined,
      ],
      [{ kind: "variant", variant: "crossfade" }, "transitions-1"],
    ])
    expect(crossfade.getAttribute("aria-pressed")).toBe("true")
  })

  it("says the same words again when they are earned again", () => {
    drawn(inMemoryStorage())
    const [, dip] = useButtons()
    fireEvent.click(dip)
    fireEvent.click(dip)
    const first = screen.getByText(PICK_WORDS.already)
    fireEvent.click(dip)
    expect(screen.getByText(PICK_WORDS.already)).not.toBe(first)
  })

  it("holds a sample's picks in memory, says so, and keeps nothing", () => {
    const storage = inMemoryStorage()
    const picks = drawn(storage, samplePicks())
    expect(screen.getByText(PICK_WORDS.sample)).toBeTruthy()
    fireEvent.click(useButtons()[1])
    expect(screen.getByText(PICK_WORDS.kept.sample)).toBeTruthy()
    expect(picks.list("runners")).toHaveLength(1)
    expect(storage.getItem(PICKS_KEY)).toBeNull()
  })

  it("asks for something else in the owner's words, and keeps them", () => {
    const picks = drawn(inMemoryStorage())
    fireEvent.click(screen.getByText(PICK_WORDS.own))
    fireEvent.change(screen.getByLabelText(PICK_WORDS.ownPrompt), {
      target: { value: "Softer, like a page turning." },
    })
    fireEvent.click(screen.getByText(PICK_WORDS.ownSend))
    expect(picks.list("runners")?.[0]?.event.chose).toEqual({
      kind: "else",
      said: "Softer, like a page turning.",
    })
  })
})
