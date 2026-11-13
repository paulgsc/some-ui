/**
 * ST26 (#2483): a new idea's answers no idea holds are shown with their
 * count, and go home only on the owner's tap; nothing here deletes one.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { PatternTake } from "@some-ui/voice-capture"
import type { UnnamedDesk } from "@soundbites/components/idea-unnamed"
import { UnnamedIdeaTakes } from "@soundbites/components/idea-unnamed"
import { AT, caught } from "@soundbites/lib/idea/__tests__/fixture"
import { answersOf, keptDraftStore } from "@soundbites/lib/idea/draft"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const W = STUDIO_WORDS.unnamed

const take = (id: string, idea: string): PatternTake => ({
  id,
  answers: answersOf(idea, "what"),
  durationMs: 1000,
  recordedAt: AT,
  standing: "current",
  kept: { place: "phone" },
  waits: true,
})

/** A desk over `start`, which lets go what `release` or `discard` names. */
function desk(start: ReadonlyArray<PatternTake>): {
  takes: UnnamedDesk
  released: Array<string>
} {
  let now = start
  const listeners = new Set<() => void>()
  const drop = (ids: ReadonlyArray<string>): void => {
    now = now.filter(({ id }) => !ids.includes(id))
    for (const listener of listeners) listener()
  }
  const released: Array<string> = []
  return {
    released,
    takes: {
      takes: {
        getSnapshot: () => now,
        subscribe: (listener): (() => void) => {
          listeners.add(listener)
          return (): void => {
            listeners.delete(listener)
          }
        },
      },
      release: (ids): boolean => {
        released.push(...ids)
        drop(ids)
        return true
      },
    },
  }
}

function setup(start: ReadonlyArray<PatternTake>): ReturnType<typeof desk> {
  const storage = inMemoryStorage()
  const ideas = keptIdeaStore(() => storage)
  ideas.keep(() => [caught("idea-1")])
  const made = desk(start)
  render(
    <UnnamedIdeaTakes
      takes={made.takes}
      drafts={keptDraftStore(() => storage)}
      ideas={ideas}
    />
  )
  return made
}

describe("answers no idea holds", () => {
  it("shows nothing while every waiting answer has its idea", () => {
    setup([take("t1", "idea-1")])
    expect(screen.queryByText(W.heading)).toBeNull()
  })

  it("keeps them on a tap, and only the unnamed ones", () => {
    const made = setup([take("t1", "idea-1"), take("t2", "gone")])
    expect(screen.getByText(W.line(1))).toBeTruthy()
    act(() => fireEvent.click(screen.getByText(W.keep)))
    expect(made.released).toEqual(["t2"])
    expect(screen.queryByText(W.heading)).toBeNull()
    expect(screen.getByText(W.kept)).toBeTruthy()
  })
})
