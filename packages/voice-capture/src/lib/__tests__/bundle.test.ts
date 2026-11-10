/**
 * The bundle machine over a spec of its own, for what it adds to a new
 * idea's bundle, whose tests are Studio's (`@some-ui/soundbites`'
 * `lib/idea/__tests__/bundle.test.ts`): a card reached from the screen
 * before the cards, a spec that offers no typing, a need of the spec's own
 * that holds Send, the record Send keeps, and a draft already sent opening
 * on what was sent; and a spec that resends until it closes (RR22).
 */
import type {
  BundleAnswer,
  BundleDraft,
  BundleEvent,
  BundleSpec,
  BundleState,
} from "@voice-capture/lib/bundle"
import { bundleMachine } from "@voice-capture/lib/bundle"
import type { TakeEnded } from "@voice-capture/lib/take-kit"
import type { PatternTake } from "@voice-capture/lib/take-pattern"
import { describe, expect, it } from "vitest"

const AT = "2026-11-09T09:00:00.000Z"
const DUE = "2026-11-16T07:59:00.000Z"
const AFTER = "2026-11-16T08:00:00.000Z"

type Ticket = "QM-1" | "QM-2"

type Sent = {
  readonly id: string
  readonly answers: ReadonlyArray<BundleAnswer<Ticket>>
  readonly passed: ReadonlyArray<Ticket>
  readonly at: string
}

type Kind = {
  readonly item: Ticket
  readonly draft: BundleDraft<Ticket>
  readonly record: Sent
  readonly edit: { readonly type: "none" }
  readonly context: null
  readonly need: "closed"
}

const SPEC: BundleSpec<Kind> = {
  items: ["QM-1", "QM-2"],
  answersOf: (draft, item) => `${draft}:${item}`,
  required: () => false,
  typing: false,
  typedMax: 0,
  withAnswers: (_draft, answers) => answers,
  // A week's draft is named by the week, whatever id the runtime offers.
  fresh: (_id, at) => ({ id: "w46", at, typed: {}, later: [] }),
  edit: (draft) => draft,
  missing: (_draft, at) => (at > DUE ? "closed" : null),
  resumesOnCards: () => false,
  record: (draft, answers, passed, at) => ({
    id: draft.id,
    answers,
    passed,
    at,
  }),
  idOf: (record) => record.id,
  named: (record) =>
    record.answers.flatMap((answer) =>
      answer.take === null ? [] : [answer.take.id]
    ),
  resends: false,
  closed: () => false,
}

const MACHINE = bundleMachine(SPEC)

function run(
  events: ReadonlyArray<BundleEvent<Kind>>,
  start: BundleState<Kind> = MACHINE.initial(null, "next", AT)
): {
  state: BundleState<Kind>
  effects: ReadonlyArray<unknown>
} {
  let state = start
  const effects: Array<unknown> = []
  for (const event of events) {
    const next = MACHINE.stepBundle(state, event)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const take = (id: string, item: Ticket): PatternTake => ({
  id,
  answers: `w46:${item}`,
  durationMs: 4_000,
  recordedAt: AT,
  standing: "current",
  kept: { place: "phone" },
  waits: true,
})

const opened = (
  takes: ReadonlyArray<PatternTake> = [],
  kept: ReadonlyArray<Sent> = []
): BundleEvent<Kind> => ({
  type: "opened",
  draft: null,
  kept,
  takes,
  context: null,
  id: "fresh",
  at: AT,
})

const ended = (over: Partial<TakeEnded>): TakeEnded => ({
  seq: 1,
  answers: "w46:QM-1",
  ending: "kept",
  id: "t1",
  reason: null,
  unheard: false,
  ...over,
})

describe("the bundle machine, over a spec of its own", () => {
  it("opens a card from the screen before the cards", () => {
    const { state } = run([
      { type: "entered", at: AT },
      opened(),
      { type: "go", index: 1, at: AT },
    ])
    expect(state.screen).toBe("cards")
    expect(state.index).toBe(1)
  })

  it("offers no typing when the spec offers none", () => {
    const failed = run([
      { type: "entered", at: AT },
      opened(),
      { type: "ended", ended: ended({ ending: "failed", id: null }) },
    ]).state
    expect(MACHINE.cardView(failed, "QM-1", false)).toEqual({
      kind: "failed",
      full: false,
    })
    expect(
      run([{ type: "typeInstead", item: "QM-1", at: AT }], failed).state
    ).toBe(failed)
    // A take kept with no voice heard in it stays the card's take.
    const unheard = run(
      [
        { type: "ended", ended: ended({ unheard: true }) },
        { type: "takes", takes: [take("t1", "QM-1")] },
      ],
      failed
    ).state
    expect(MACHINE.cardView(unheard, "QM-1", false)).toEqual({ kind: "take" })
  })

  it("holds Send on the spec's own need, read when Send is tapped", () => {
    const review = run([
      { type: "entered", at: AT },
      opened([take("t1", "QM-1")]),
      { type: "start", at: AT },
      { type: "review", at: AT },
    ]).state
    expect(MACHINE.missing(review)).toBeNull()
    const late = run([{ type: "send", at: AFTER }], review)
    expect(late.effects).toEqual([])
    expect(MACHINE.missing(late.state)).toBe("closed")
  })

  it("sends each answer's take, and the items with none passed over", () => {
    const review = run([
      { type: "entered", at: AT },
      opened([take("t1", "QM-1")]),
      { type: "start", at: AT },
      { type: "review", at: AT },
    ]).state
    const { effects } = run([{ type: "send", at: AT }], review)
    expect(effects).toEqual([
      {
        type: "send",
        record: {
          id: "w46",
          answers: [{ item: "QM-1", take: { id: "t1", at: AT }, typed: null }],
          passed: ["QM-2"],
          at: AT,
        },
        takes: ["t1"],
      },
    ])
  })

  it("opens a draft already sent on what was sent, never as a second draft", () => {
    const sent: Sent = { id: "w46", answers: [], passed: ["QM-1"], at: AT }
    const { state } = run([{ type: "entered", at: AT }, opened([], [sent])])
    expect(state.screen).toBe("sent")
    expect(state.sent).toBe(sent)
    expect(run([{ type: "review", at: AT }], state).state.screen).toBe("sent")
  })

  it("starts no second draft named as the record just sent", () => {
    const sent: Sent = { id: "w46", answers: [], passed: ["QM-1"], at: AT }
    const { state } = run([{ type: "entered", at: AT }, opened([], [sent])])
    expect(run([{ type: "another", id: "other", at: AT }], state).state).toBe(
      state
    )
  })

  it("keeps the state as it was when a step changes nothing", () => {
    const { state } = run([{ type: "entered", at: AT }, opened()])
    const before = "2026-11-10T09:00:00.000Z"
    expect(run([{ type: "swipe", to: "next", at: before }], state).state).toBe(
      state
    )
  })
})

/** The same week, open until its deadline after a Send (RR22). */
const AGAIN = bundleMachine<Kind>({
  ...SPEC,
  resends: true,
  closed: (_draft, at) => at > DUE,
})

function again(
  events: ReadonlyArray<BundleEvent<Kind>>,
  start: BundleState<Kind> = AGAIN.initial(null, "next", AT)
): { state: BundleState<Kind>; effects: ReadonlyArray<unknown> } {
  let state = start
  const effects: Array<unknown> = []
  for (const event of events) {
    const next = AGAIN.stepBundle(state, event)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const LATER = "2026-11-10T09:00:00.000Z"

const sentOne: Sent = {
  id: "w46",
  answers: [{ item: "QM-1", take: { id: "t1", at: AT }, typed: null }],
  passed: ["QM-2"],
  at: AT,
}

/** `t1` let go home with `sentOne`; `waits` gone. */
const t1Sent: PatternTake = { ...take("t1", "QM-1"), waits: undefined }

describe("a spec that resends, until it closes (RR22)", () => {
  it("opens a week sent on the screen before the cards, beside its last send, its draft kept", () => {
    const draft = { id: "w46", at: AT, typed: {}, later: ["QM-2" as const] }
    const second: Sent = { ...sentOne, at: LATER }
    const { state, effects } = again([
      { type: "entered", at: AT },
      {
        type: "opened",
        draft,
        kept: [sentOne, second],
        takes: [t1Sent],
        context: null,
        id: "fresh",
        at: AT,
      },
    ])
    expect(state.screen).toBe("intro")
    expect(state.sent).toBe(second)
    expect(state.draft).toEqual(draft)
    expect(effects).not.toContainEqual({ type: "keepDraft", draft: null })
  })

  it("sends again only once something changed, a take said again included", () => {
    const open = again([
      { type: "entered", at: AT },
      opened([t1Sent], [sentOne]),
      { type: "review", at: LATER },
    ]).state
    expect(AGAIN.missing(open)).toBe("unchanged")
    expect(again([{ type: "send", at: LATER }], open).effects).toEqual([])
    const redo: PatternTake = {
      ...take("t2", "QM-1"),
      recordedAt: LATER,
    }
    const said = again(
      [
        {
          type: "takes",
          takes: [{ ...t1Sent, standing: "earlier" }, redo],
        },
      ],
      open
    ).state
    expect(AGAIN.missing(said)).toBeNull()
    expect(again([{ type: "send", at: LATER }], said).effects).toEqual([
      {
        type: "send",
        record: {
          id: "w46",
          answers: [
            { item: "QM-1", take: { id: "t2", at: LATER }, typed: null },
          ],
          passed: ["QM-2"],
          at: LATER,
        },
        takes: ["t2"],
      },
    ])
  })

  it("never deletes a take that left the phone", () => {
    const open = again([
      { type: "entered", at: AT },
      opened([t1Sent], [sentOne]),
      { type: "go", index: 0, at: AT },
    ]).state
    expect(
      again([{ type: "askDelete", item: "QM-1", at: AT }], open).state
    ).toMatchObject({ confirm: null })
    const redo = { ...take("t2", "QM-1"), recordedAt: LATER }
    const both = again(
      [
        { type: "takes", takes: [{ ...t1Sent, standing: "earlier" }, redo] },
        { type: "askDelete", item: "QM-1", at: LATER },
        { type: "confirmed", at: LATER },
      ],
      open
    )
    expect(both.effects).toContainEqual({ type: "deleteTakes", takes: ["t2"] })
    const all = again(
      [
        { type: "askDeleteAll", at: LATER },
        { type: "confirmed", at: LATER },
      ],
      both.state
    )
    expect(all.effects).toContainEqual({ type: "deleteAll", takes: ["t2"] })
  })

  it("goes back to the week from what was just sent", () => {
    const { state } = again([
      { type: "entered", at: AT },
      opened([t1Sent], [sentOne]),
      { type: "sentKept", record: sentOne },
    ])
    expect(state.screen).toBe("sent")
    expect(again([{ type: "back", at: AT }], state).state.screen).toBe("intro")
  })

  it("once closed, records, deletes and sends nothing, and still plays", () => {
    const open = again([
      { type: "entered", at: AT },
      opened([t1Sent, take("t2", "QM-2")], [sentOne]),
      { type: "go", index: 1, at: AT },
    ]).state
    for (const tap of [
      { type: "tap", item: "QM-2", at: AFTER },
      { type: "askDelete", item: "QM-2", at: AFTER },
      { type: "askDeleteAll", at: AFTER },
      { type: "review", at: AFTER },
      { type: "send", at: AFTER },
      { type: "later", item: "QM-2", at: AFTER },
    ] as const) {
      const step = again([tap], open)
      expect(step.effects).toEqual([])
      expect(step.state).toEqual({ ...open, at: AFTER })
    }
    expect(
      again([{ type: "play", take: "t1", at: AFTER }], open).effects
    ).toEqual([{ type: "play", take: "t1" }])
  })

  it("stops a take under way at the deadline on its own button", () => {
    const busy = again([
      { type: "entered", at: AT },
      opened([t1Sent], [sentOne]),
      { type: "go", index: 0, at: AT },
      { type: "busy", busy: true },
    ]).state
    expect(
      again([{ type: "tap", item: "QM-1", at: AFTER }], busy).effects
    ).toEqual([{ type: "tap", answers: "w46:QM-1", supersedes: null }])
  })
})
