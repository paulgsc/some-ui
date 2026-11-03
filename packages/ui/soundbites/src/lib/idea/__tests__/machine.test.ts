/** @vitest-environment node */
import type {
  IdeaEvent,
  IdeaIntent,
  IdeaState,
} from "@soundbites/lib/idea/machine"
import { apply, initialIdeaState, step } from "@soundbites/lib/idea/machine"
import type { Idea } from "@soundbites/lib/idea/model"
import { grows, waiting } from "@soundbites/lib/idea/model"
import { describe, expect, it } from "vitest"

import { asked } from "./fixture"

const AT = "2026-10-30T10:00:00.000Z"

/** The idea Claude asked three questions about, as the shelf opens it. */
const ASKED: Idea = asked()

/** Runs events through `step`, applying each keep to `ideas` as a store would. */
function run(
  events: ReadonlyArray<IdeaEvent>,
  start: IdeaState = initialIdeaState("idea-1"),
  ideas: Array<Idea> = [ASKED]
): {
  state: IdeaState
  ideas: ReadonlyArray<Idea>
  listens: Array<number>
  /** How often it asked whether the phone can listen. */
  checks: number
} {
  let state = start
  let kept: ReadonlyArray<Idea> = ideas
  const listens: Array<number> = []
  let checks = 0
  const queue = [...events]
  while (queue.length > 0) {
    const event = queue.shift()
    if (event === undefined) break
    const next = step(state, event)
    state = next.state
    for (const effect of next.effects) {
      if (effect.type === "keep") {
        const after = apply(kept, effect.op)
        expect(grows(kept, after)).toBe(true)
        kept = after
        queue.unshift({ type: "kept", ideas: kept })
      }
      if (effect.type === "listen") listens.push(effect.seq)
      if (effect.type === "checkVoice") checks += 1
    }
  }
  return { state, ideas: kept, listens, checks }
}

const tap = (intent: IdeaIntent): IdeaEvent => ({
  ...intent,
  at: AT,
})

const OPENED: ReadonlyArray<IdeaEvent> = [
  { type: "entered", at: AT },
  { type: "listed", ideas: [ASKED] },
  { type: "voiceChecked", available: true },
]

function screenOf(state: IdeaState): string {
  const { screen } = state
  return screen.kind === "ask"
    ? `ask:${screen.question}:${state.turn.phase.kind}`
    : screen.kind
}

describe("catching an idea", () => {
  it("opens at the first question, ready to talk", () => {
    expect(screenOf(run(OPENED).state)).toBe("ask:ask-1:idle")
  })

  it("IH1: asks again what can listen as each question opens while it can't, and offers Say it once it can", () => {
    const away = run([
      ...OPENED,
      tap({ type: "talk" }),
      {
        type: "listened",
        seq: 1,
        result: { kind: "kept", on: "phone", why: "away" },
      },
    ])
    expect(screenOf(away.state)).toBe("ask:ask-1:typing")
    expect(away.state.turn.notice).toBe("awayOnPhone")
    // Entering asked once; home not answering asks again.
    expect(away.checks).toBe(2)
    const typing = run(
      [
        { type: "voiceChecked", available: false },
        tap({ type: "draft", text: "typed idea" }),
        tap({ type: "save" }),
      ],
      away.state
    )
    expect(screenOf(typing.state)).toBe("ask:ask-2:typing")
    expect(typing.checks).toBe(1)
    const back = run([{ type: "voiceChecked", available: true }], typing.state)
    expect(screenOf(back.state)).toBe("ask:ask-2:idle")
    expect(back.state.turn.voice).toBe("ready")
  })

  it("says so, and keeps the words on screen, when the phone refuses them", () => {
    const opened = run([
      ...OPENED,
      tap({ type: "type" }),
      tap({ type: "draft", text: "idea" }),
    ]).state
    const saved = step(opened, tap({ type: "save" }))
    const refused = step(saved.state, { type: "kept", ideas: null })
    expect(refused.state.turn.notice).toBe("notKept")
    expect(refused.state.turn.phase).toEqual({ kind: "typing", draft: "idea" })
  })

  it("asks Claude's questions about one idea, and a skipped one later (ST19)", () => {
    const focused = run([
      ...OPENED,
      tap({ type: "talk" }),
      {
        type: "listened",
        seq: 1,
        result: { kind: "heard", words: "week 8" },
      },
      tap({ type: "meant" }),
      tap({ type: "skip" }),
      tap({ type: "skip" }),
    ])
    expect(screenOf(focused.state)).toBe("kept")
    const kept = focused.ideas[0]
    expect(kept?.answers.at(-1)).toEqual({
      question: "ask-1",
      versions: [{ at: AT, how: "heard", words: "week 8" }],
    })
    expect(kept?.passed).toEqual(["ask-2", "ask-3"])

    // Skipped, it waits on nothing, and is still answered when asked for.
    if (!kept) throw new Error("kept")
    expect(waiting(kept)).toBe(0)
    expect(
      screenOf(step(focused.state, tap({ type: "answerSkipped" })).state)
    ).toBe("ask:ask-2:idle")
    const reopened = run(
      [
        { type: "entered", at: AT },
        { type: "listed", ideas: [kept] },
      ],
      initialIdeaState("idea-1"),
      [kept]
    )
    expect(screenOf(reopened.state)).toBe("ask:ask-2:idle")
  })

  it("says the idea can't be read when it isn't among those kept", () => {
    expect(
      screenOf(
        run([
          { type: "entered", at: AT },
          { type: "listed", ideas: [] },
        ]).state
      )
    ).toBe("unreadable")
  })
})
