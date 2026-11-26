/**
 * @vitest-environment jsdom
 *
 * HOST16 (#3558): the preview card picks with one tap and keeps the pick as
 * the record's approval, saying where it is kept; something else takes the
 * owner's words; a kept pick can't be picked over.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { phonePicks, PICK_WORDS } from "@/lib/preview-pick"
import { PreviewPick } from "@/components/studio/preview-pick"

afterEach(cleanup)

const memory = (): KeyedStorage => {
  const held = new Map<string, string>()
  return {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v): void => {
      held.set(k, v)
    },
    removeItem: (k): void => {
      held.delete(k)
    },
  }
}

const AT = "2026-11-26T10:00:00.000Z"

const drawn = (storage: KeyedStorage): ReturnType<typeof phonePicks> => {
  const picks = phonePicks(() => storage)
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
    drawn(memory())
    expect(screen.getAllByText(PICK_WORDS.use)).toHaveLength(2)
    expect(screen.getByText("New chapter: dip to black")).toBeTruthy()
    expect(screen.getByText(PICK_WORDS.recommended)).toBeTruthy()
    const video = document.querySelector("video")
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(screen.getByText(PICK_WORDS.noClip)).toBeTruthy()
  })

  it("keeps one tap as the record's approval, says where, and refuses a second pick", () => {
    const storage = memory()
    const picks = drawn(storage)
    fireEvent.click(screen.getByText("Dip to black"))
    expect(screen.getByText(PICK_WORDS.kept.phone)).toBeTruthy()
    expect(picks.list("runners")?.map((p) => p.event.chose)).toEqual([
      {
        kind: "variant",
        variant: "dip-to-black",
        rule: "joins-dip-at-chapters",
      },
    ])
    fireEvent.click(screen.getByText("Crossfade"))
    expect(screen.getByText(PICK_WORDS.already)).toBeTruthy()
    expect(picks.list("runners")).toHaveLength(1)
  })

  it("asks for something else in the owner's words, and keeps them", () => {
    const picks = drawn(memory())
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
