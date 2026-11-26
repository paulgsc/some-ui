/**
 * CR1 (HOST11, #3553): every order of events keeps a conversation's record
 * whole. Family: every interleaving, up to `DEPTH` accepted events, of the
 * alphabet below (a topic, points and a retake, versions answering flags by
 * each kind of answer, flags of each voice, withdrawals, measured lengths,
 * green lights, the agent's notes, with and without a rule, an approval). The
 * step is pure, so an order's future depends only on the state it reached:
 * the walk visits every distinct state those orders reach and tries every
 * event of the alphabet at each one short of `DEPTH`; the
 * events' order is the log's own, its clocks never compared (C1580), held
 * by its own tests below. Proof: the walk
 * in "every event order" holds that nothing kept is lost, that the phase
 * matches the open flags, that a version answers exactly the open flags,
 * that notes follow only rules the owner approved, and that the log of accepted events
 * replays to the same state. What each
 * answer must show of the two versions is held by the refusals below.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ANSWER_KINDS,
  ANSWERS_OF,
  approvedRules,
  changedTurns,
  CONVERSATION_ACCEPTS,
  CONVERSATION_POLICY,
  CONVERSATION_RECORD_SCHEMA,
  CONVERSATION_RECORD_SCHEMA_V1,
  FLAG_KINDS,
  FLAG_SCOPES,
  FLAG_VOICE,
  greenLitVersion,
  heardMs,
  latestVersion,
  lineNotes,
  NEW_CONVERSATION,
  openFlags,
  ownerSpans,
  ownerTakes,
  parseConversationRecord,
  refusalLine,
  replayConversation,
  stepConversation,
} from "@video-render/conversation"
import type {
  ConversationEvent,
  ConversationFlag,
  ConversationSpeaker,
  ConversationState,
  ConversationTurn,
  FlagAnswer,
  PodcastVersion,
  Span,
} from "@video-render/conversation"
import { describe, expect, it } from "vitest"

const AT = "2026-11-26T10:00:00.000Z"

type Line = Extract<ConversationTurn, { voice: "kokoro" }>
type Take = Extract<ConversationTurn, { voice: "owner" }>

/** An essay's two speakers: Tin Bird in Kokoro's voice, Mochi in the owner's. */
const ESSAY: ReadonlyArray<ConversationSpeaker> = [
  { id: "tin", character: "tin-owlet", voice: { kind: "kokoro" } },
  { id: "mochi", character: "mochi", voice: { kind: "owner" } },
]

const ask: Line = {
  id: "k1",
  speaker: "tin",
  voice: "kokoro",
  said: "What changed in week twelve?",
}
const take: Take = {
  id: "o1",
  speaker: "mochi",
  voice: "owner",
  take: "take-a",
}
const close: Line = {
  id: "k2",
  speaker: "tin",
  voice: "kokoro",
  said: "So the line moved because of the injury.",
}

const version = (
  n: number,
  turns: ReadonlyArray<ConversationTurn>,
  answers: ReadonlyArray<FlagAnswer> = [],
  speakers: ReadonlyArray<ConversationSpeaker> = ESSAY
): ConversationEvent => ({
  event: "version",
  by: "agent",
  at: AT,
  version: {
    n,
    speakers: [...speakers],
    turns: [...turns],
    answers: [...answers],
  },
})

const reworded: Line = {
  ...ask,
  said: "Week twelve: what moved the line?",
}
const retaken: Take = { ...take, take: "take-b" }

/** The alphabet every order is drawn from. */
const ALPHABET: Readonly<Record<string, ConversationEvent>> = {
  topic: {
    event: "topic",
    by: "owner",
    at: AT,
    topic: { said: "Why the line moved in week twelve" },
  },
  pointA: { event: "point", by: "owner", at: AT, take: "take-a" },
  pointB: { event: "point", by: "owner", at: AT, take: "take-b" },
  v1: version(1, [ask, take, close]),
  v2rewrote: version(
    2,
    [reworded, take, close],
    [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
  ),
  v2both: version(
    2,
    [reworded, retaken, close],
    [
      { flag: "f1", how: "rewrote", turns: ["k1"] },
      { flag: "f2", how: "retook", take: "take-b" },
    ]
  ),
  v2kept: version(
    2,
    [ask, take, close],
    [
      { flag: "f1", how: "kept", note: "The question is the week's own." },
      { flag: "f2", how: "kept", note: "The take is clear." },
    ]
  ),
  v2covariant: version(
    2,
    [take, reworded],
    [{ flag: "f1", how: "rewrote", turns: ["o1", "k1", "k2"] }]
  ),
  v2conditioned: version(
    2,
    [ask, take, close],
    [{ flag: "f5", how: "conditioned" }]
  ),
  v3: version(
    3,
    [ask, take, close],
    [{ flag: "f3", how: "rewrote", turns: ["k1"] }]
  ),
  flagAgent: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: {
      id: "f1",
      on: { scope: "turn", turn: "k1" },
      kinds: ["assumes-context"],
      note: "Which line?",
    },
  },
  flagOwner: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id: "f2", on: { scope: "turn", turn: "o1" }, kinds: ["say-again"] },
  },
  flagWrongVoice: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id: "f9", on: { scope: "turn", turn: "o1" }, kinds: ["unhuman"] },
  },
  flagLater: {
    event: "flag",
    by: "owner",
    version: 2,
    at: AT,
    flag: { id: "f3", on: { scope: "turn", turn: "k1" }, kinds: ["off-taste"] },
  },
  flagClose: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: {
      id: "f4",
      on: { scope: "turn", turn: "k2" },
      kinds: ["misses-point"],
    },
  },
  flagQuiet: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id: "f5", on: { scope: "turn", turn: "o1" }, kinds: ["too-quiet"] },
  },
  withdrawAgent: { event: "withdraw", by: "owner", at: AT, flag: "f1" },
  withdrawOwner: { event: "withdraw", by: "owner", at: AT, flag: "f2" },
  heard1: { event: "heard", by: "home", at: AT, version: 1, ms: 60_000 },
  heard2: { event: "heard", by: "home", at: AT, version: 2, ms: 60_000 },
  notesAgent: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k1",
    words: [{ at: 0, stress: 0.6, notes: [{ emotion: "curious", weight: 1 }] }],
    rules: ["verdict-close-up"],
  },
  notesRuled: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k1",
    words: [{ at: 0, notes: [{ emotion: "perplexed", weight: 0.5 }] }],
    rules: ["verdict-close-up"],
  },
  approveA: {
    event: "approve",
    by: "owner",
    at: AT,
    preview: "close-up-on-verdict",
    offered: ["close-up", "corner"],
    recommended: "close-up",
    chose: { kind: "variant", variant: "close-up", rule: "verdict-close-up" },
  },
  green1: { event: "green-light", by: "owner", at: AT, version: 1 },
  green2: { event: "green-light", by: "owner", at: AT, version: 2 },
}

/** An alphabet's event as the kind it is, for a test that changes one field. */
function eventOf<K extends ConversationEvent["event"]>(
  name: string,
  kind: K
): Extract<ConversationEvent, { event: K }> {
  const event = ALPHABET[name]
  const isKind = (
    e: ConversationEvent | undefined
  ): e is Extract<ConversationEvent, { event: K }> => e?.event === kind
  if (!isKind(event)) throw new Error(`${name} isn't a ${kind} event`)
  return event
}

/** Every law a single step keeps, from `before` by `event`. */
/** JSON's text of `value`: a cheap equality over the walk's thousands of steps. */
const text = (value: unknown): string => JSON.stringify(value)

/** Every law a step from `before` by `event` to `after` breaks, as lines. */
function stepProblems(
  before: ConversationState,
  event: ConversationEvent,
  after: ConversationState
): Array<string> {
  const problems: Array<string> = []
  const law = (holds: boolean, what: string): void => {
    if (!holds) problems.push(`${event.event} from ${before.phase}: ${what}`)
  }
  // Nothing kept is lost: every version and flag before is still there,
  // unchanged but for a withdrawal.
  if (before.phase !== "new" && after.phase !== "new") {
    law(
      text(after.versions.slice(0, before.versions.length)) ===
        text(before.versions),
      "a version was lost or changed"
    )
    law(
      text(after.points.slice(0, before.points.length)) === text(before.points),
      "a point was lost"
    )
    law(text(after.topic) === text(before.topic), "the topic changed")
    for (const field of ["heard", "notes", "approvals"] as const)
      law(
        text(after[field].slice(0, before[field].length)) ===
          text(before[field]),
        `the ${field} kept were lost or changed`
      )
    // Notes follow only the rules the owner's approvals set.
    if (event.event === "notes")
      law(
        event.rules.every((r) => approvedRules(before).includes(r)),
        "notes follow a rule nobody approved"
      )
    for (const [i, flag] of before.flags.entries()) {
      const now = after.flags[i]
      law(
        now !== undefined &&
          text({ ...now, withdrawn: flag.withdrawn }) === text(flag) &&
          (!flag.withdrawn || now.withdrawn),
        `flag ${flag.id} was lost or changed`
      )
    }
  }
  // The phase is what the record says it is.
  if (after.phase === "drafting")
    law(after.versions.length === 0, "drafting with a version")
  if (after.phase === "podcast")
    law(openFlags(after).length === 0, "podcast with an open flag")
  if (after.phase === "flagged")
    law(openFlags(after).length > 0, "flagged with no open flag")
  if (after.phase === "green-lit")
    law(
      greenLitVersion(after)?.n === latestVersion(after)?.n,
      "green-lit an older version"
    )
  if (event.event === "version")
    law(
      text(
        event.version.answers
          .flatMap((a) => (a.how === "unasked" ? [] : [a.flag]))
          .sort()
      ) ===
        text(
          openFlags(before)
            .map((f) => f.id)
            .sort()
        ),
      "the version doesn't answer exactly the open flags"
    )
  return problems
}

const DEPTH = 9

describe("every event order (CR1)", () => {
  it("keeps the record whole, and a replay of what was kept is the same state", () => {
    const reached = new Set<string>()
    const acceptedOnce = new Set<string>()
    const seen = new Set<string>()
    const problems: Array<string> = []
    // The step is pure, so what follows an order depends only on the state
    // it reached. The walk is breadth first, so each state is met first by
    // its shortest order, walked once from there, and its log must replay
    // to it.
    let frontier: ReadonlyArray<{
      readonly state: ConversationState
      readonly kept: ReadonlyArray<ConversationEvent>
    }> = [{ state: NEW_CONVERSATION, kept: [] }]
    for (let depth = 0; frontier.length > 0; depth += 1) {
      const next: Array<(typeof frontier)[number]> = []
      for (const { state, kept } of frontier) {
        const key = text(state)
        if (seen.has(key)) continue
        seen.add(key)
        reached.add(state.phase)
        const replayed = replayConversation(kept)
        if (!replayed.ok || text(replayed.state) !== key)
          problems.push(`${kept.length} events don't replay to their state`)
        if (depth === DEPTH) continue
        for (const [name, event] of Object.entries(ALPHABET)) {
          const stepped = stepConversation(state, event)
          if (!stepped.ok) continue
          problems.push(...stepProblems(state, event, stepped.state))
          acceptedOnce.add(name)
          next.push({ state: stepped.state, kept: [...kept, event] })
        }
      }
      frontier = next
    }
    expect([...reached].sort()).toEqual(
      Object.keys(CONVERSATION_ACCEPTS).sort()
    )
    // Every event but the misplaced flag is accepted somewhere, so the walk
    // reaches v3, every kind of answer and each withdrawal.
    expect(Object.keys(ALPHABET).filter((n) => !acceptedOnce.has(n))).toEqual([
      "flagWrongVoice",
    ])
    expect(problems).toEqual([])
    expect(seen.size).toBeGreaterThan(1000)
  })

  it("closes on a green light: nothing is accepted after it", () => {
    const { topic, pointA, v1, green1 } = ALPHABET
    const { heard1 } = ALPHABET
    const replayed = replayConversation([
      topic!,
      pointA!,
      v1!,
      heard1!,
      green1!,
    ])
    expect(replayed.ok).toBe(true)
    if (!replayed.ok) return
    // Only the signature goes on: notes and approvals.
    const after = Object.entries(ALPHABET).filter(
      ([, event]) => stepConversation(replayed.state, event).ok
    )
    expect(after.map(([name]) => name)).toEqual(["approveA"])
  })
})

describe("a flag never edits a turn; the next version answers it", () => {
  const start = (...names: ReadonlyArray<string>): ConversationState => {
    const replayed = replayConversation(names.map((n) => ALPHABET[n]!))
    if (!replayed.ok) throw new Error(refusalLine(replayed.refusal))
    return replayed.state
  }

  it("keeps v1 as written after a flag, a withdrawal and v2", () => {
    const state = start(
      "topic",
      "pointA",
      "pointB",
      "v1",
      "flagAgent",
      "flagOwner",
      "v2both"
    )
    expect(state.phase).toBe("podcast")
    if (state.phase === "new") return
    expect(state.versions.map((v) => v.n)).toEqual([1, 2])
    expect(state.versions[0]?.turns).toEqual([ask, take, close])
    expect(ownerTakes(state.versions[1]!)).toEqual(["take-b"])
  })

  it("refuses a version that leaves an open flag unanswered", () => {
    const state = start("topic", "pointA", "v1", "flagAgent", "flagOwner")
    expect(stepConversation(state, ALPHABET.v2rewrote!)).toEqual({
      ok: false,
      refusal: { why: "unanswered", flag: "f2" },
    })
  })

  it("lets a withdrawn flag go unanswered", () => {
    const state = start(
      "topic",
      "pointA",
      "v1",
      "flagAgent",
      "withdrawAgent",
      "heard1"
    )
    expect(state.phase).toBe("podcast")
    expect(stepConversation(state, ALPHABET.green1!).ok).toBe(true)
  })

  it("refuses an answer that names a turn it didn't change", () => {
    const state = start("topic", "pointA", "v1", "flagAgent")
    const stepped = stepConversation(
      state,
      version(
        2,
        [ask, take, close],
        [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
      )
    )
    expect(stepped).toEqual({
      ok: false,
      refusal: { why: "rewrote-unchanged", flag: "f1", turn: "k1" },
    })
  })

  it("refuses a retake that isn't one of the owner's points", () => {
    const state = start("topic", "pointA", "v1", "flagOwner")
    const stepped = stepConversation(
      state,
      version(
        2,
        [ask, retaken, close],
        [{ flag: "f2", how: "retook", take: "take-b" }]
      )
    )
    expect(stepped).toEqual({
      ok: false,
      refusal: { why: "take-unknown", turn: "o1", take: "take-b" },
    })
  })

  const refusedBy = (
    names: ReadonlyArray<string>,
    turns: ReadonlyArray<ConversationTurn>,
    answers: ReadonlyArray<FlagAnswer>
  ): unknown => {
    const stepped = stepConversation(
      start(...names),
      version(2, turns, answers)
    )
    return stepped.ok ? null : stepped.refusal
  }

  it("refuses keeping a flag whose turn changed", () => {
    expect(
      refusedBy(
        ["topic", "pointA", "v1", "flagOwner"],
        [ask, close],
        [{ flag: "f2", how: "kept", note: "Fine as it is." }]
      )
    ).toEqual({ why: "kept-changed", flag: "f2" })
  })

  it("refuses conditioning that swaps the take", () => {
    expect(
      refusedBy(
        ["topic", "pointA", "pointB", "v1", "flagQuiet"],
        [ask, retaken, close],
        [{ flag: "f5", how: "conditioned" }]
      )
    ).toEqual({ why: "conditioned-unplaced", flag: "f5" })
  })

  it("refuses a retake of a take the version before already played", () => {
    expect(
      refusedBy(
        ["topic", "pointA", "v1", "flagOwner"],
        [ask, take, close],
        [{ flag: "f2", how: "retook", take: "take-a" }]
      )
    ).toEqual({ why: "retook-unplaced", flag: "f2" })
  })

  it("keeps a turn that only moved, when a rewrite names the move", () => {
    const state = start("topic", "pointA", "v1", "flagAgent", "flagOwner")
    const stepped = stepConversation(
      state,
      version(
        2,
        [take, close],
        [
          { flag: "f1", how: "rewrote", turns: ["k1", "o1"] },
          { flag: "f2", how: "kept", note: "The take is clear." },
        ]
      )
    )
    expect(stepped.ok).toBe(true)
  })

  it("refuses a change no answer names", () => {
    expect(
      refusedBy(
        ["topic", "pointA", "v1", "flagAgent"],
        [reworded, take, { ...close, said: "And that is the week." }],
        [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
      )
    ).toEqual({ why: "change-unnamed", turn: "k2" })
  })

  it("refuses a turn id that changes voice", () => {
    expect(
      refusedBy(
        ["topic", "pointA", "v1", "flagQuiet"],
        [
          ask,
          {
            id: "o1",
            speaker: "tin",
            voice: "kokoro",
            said: "I'll say it for you.",
          },
          close,
        ],
        [{ flag: "f5", how: "kept", note: "Kept." }]
      )
    ).toEqual({ why: "turn-voice", turn: "o1", voice: "owner" })
  })

  it("refuses a take played twice in one version", () => {
    expect(
      stepConversation(
        start("topic", "pointA"),
        version(1, [take, ask, { ...take, id: "o2" }])
      )
    ).toEqual({ ok: false, refusal: { why: "take-twice", take: "take-a" } })
  })

  // C1580: the log's order is its own, never the writers' clocks. Family:
  // a writer an hour behind the log's newest event, one ahead, a writer
  // naming the log it wrote against (current or stale), and one naming none.
  it("orders events by their place in the log: a writer an hour behind is kept", () => {
    const behind = "2026-11-26T09:00:00.000Z"
    const state = start("topic", "pointA", "v1")
    const flagged = stepConversation(state, {
      ...ALPHABET.flagAgent!,
      at: behind,
    })
    expect(flagged.ok).toBe(true)
    if (!flagged.ok) return
    // And an event written before it, by a clock ahead, follows it too.
    expect(
      stepConversation(flagged.state, {
        event: "withdraw",
        by: "owner",
        at: "2026-11-26T11:00:00.000Z",
        flag: "f1",
      }).ok
    ).toBe(true)
  })

  it("refuses an event written against an older log, by its number", () => {
    const state = start("topic", "pointA", "v1")
    // topic, a point and a version: the log holds three events.
    expect(
      stepConversation(state, {
        ...ALPHABET.flagAgent!,
        basis: 3,
      }).ok
    ).toBe(true)
    expect(
      stepConversation(state, {
        ...ALPHABET.flagAgent!,
        basis: 2,
      })
    ).toEqual({ ok: false, refusal: { why: "stale", basis: 2, seq: 3 } })
  })

  it("refuses a flag on the other voice's turn", () => {
    const state = start("topic", "pointA", "v1")
    expect(stepConversation(state, ALPHABET.flagWrongVoice!)).toEqual({
      ok: false,
      refusal: {
        why: "flag-voice",
        flag: "f9",
        kind: "unhuman",
      },
    })
  })
})

describe("speakers", () => {
  const drama: ReadonlyArray<ConversationSpeaker> = [
    { id: "owlet", character: "tin-owlet", voice: { kind: "kokoro" } },
    { id: "sparrow", character: "tin-sparrow", voice: { kind: "kokoro" } },
    { id: "mochi", character: "mochi", voice: { kind: "owner" } },
  ]
  const drafting = replayConversation([
    {
      event: "topic",
      by: "owner",
      at: AT,
      topic: { said: "A panel at the bus stop" },
    },
    { event: "point", by: "owner", at: AT, take: "take-a" },
  ])

  it("takes a drama's ensemble as the same record: three speakers, two in Kokoro", () => {
    if (!drafting.ok) throw new Error(refusalLine(drafting.refusal))
    const stepped = stepConversation(
      drafting.state,
      version(
        1,
        [
          { id: "s1", speaker: "owlet", voice: "kokoro", said: "Late again." },
          { id: "s2", speaker: "sparrow", voice: "kokoro", said: "Always." },
          { id: "s3", speaker: "mochi", voice: "owner", take: "take-a" },
        ],
        [],
        drama
      )
    )
    expect(stepped.ok).toBe(true)
  })

  it("names a recast speaker's turns as changed, and refuses one cast member as two speakers", () => {
    const v = (
      speakers: ReadonlyArray<ConversationSpeaker>
    ): PodcastVersion => ({
      n: 1,
      speakers: [...speakers],
      turns: [ask, take, close],
      answers: [],
    })
    const recast = ESSAY.map((s) =>
      s.id === "tin" ? { ...s, character: "tin-sparrow" as const } : s
    )
    expect(changedTurns(v(ESSAY), v(recast))).toEqual(["k1", "k2"])
    if (!drafting.ok) throw new Error(refusalLine(drafting.refusal))
    expect(
      stepConversation(
        drafting.state,
        version(
          1,
          [ask],
          [],
          [
            ...ESSAY,
            { id: "tin2", character: "tin-owlet", voice: { kind: "kokoro" } },
          ]
        )
      )
    ).toEqual({
      ok: false,
      refusal: { why: "cast-twice", character: "tin-owlet", role: undefined },
    })
  })

  it("refuses a turn by a speaker the version doesn't have, or in another voice", () => {
    if (!drafting.ok) throw new Error(refusalLine(drafting.refusal))
    expect(
      stepConversation(
        drafting.state,
        version(1, [{ ...ask, speaker: "sparrow" }])
      )
    ).toEqual({
      ok: false,
      refusal: { why: "speaker-unknown", turn: "k1", speaker: "sparrow" },
    })
    expect(
      stepConversation(
        drafting.state,
        version(1, [{ ...ask, speaker: "mochi" }])
      )
    ).toEqual({
      ok: false,
      refusal: { why: "speaker-voice", turn: "k1", speaker: "mochi" },
    })
  })
})

describe("the closed sets", () => {
  it("lets every flag be kept, with a reason", () => {
    for (const kind of FLAG_KINDS) expect(ANSWERS_OF[kind]).toContain("kept")
  })

  it("answers an owner's flag only by the owner's take, and an agent's only by a rewrite", () => {
    for (const kind of FLAG_KINDS) {
      const answers: ReadonlyArray<string> = ANSWERS_OF[kind]
      if (answers.includes("rewrote")) expect(FLAG_VOICE[kind]).toBe("kokoro")
      if (FLAG_VOICE[kind] === "owner") expect(answers).not.toContain("rewrote")
    }
  })

  it("refuses, for every flag kind, each answer its table doesn't give", () => {
    for (const kind of FLAG_KINDS) {
      const turn = FLAG_VOICE[kind] === "owner" ? "o1" : "k1"
      const flagged = replayConversation([
        ALPHABET.topic!,
        ALPHABET.pointA!,
        ALPHABET.pointB!,
        ALPHABET.v1!,
        {
          event: "flag",
          by: "owner",
          version: 1,
          at: AT,
          flag: {
            id: "f1",
            on: FLAG_SCOPES[kind].some((scope) => scope === "turn")
              ? { scope: "turn", turn }
              : { scope: "speaker", speaker: "tin" },
            kinds: [kind],
          },
        },
      ])
      if (!flagged.ok) throw new Error(refusalLine(flagged.refusal))
      const answers: ReadonlyArray<string> = ANSWERS_OF[kind]
      for (const how of ANSWER_KINDS.filter((h) => !answers.includes(h))) {
        const answer: FlagAnswer =
          how === "rewrote"
            ? { flag: "f1", how, turns: ["k1"] }
            : how === "retook"
              ? { flag: "f1", how, take: "take-b" }
              : how === "kept"
                ? { flag: "f1", how, note: "Kept." }
                : { flag: "f1", how }
        const turns =
          turn === "k1" ? [reworded, take, close] : [ask, retaken, close]
        expect(
          stepConversation(flagged.state, version(2, turns, [answer]))
        ).toEqual({
          ok: false,
          refusal: { why: "answer-kind", flag: "f1", kind, how },
        })
      }
    }
  })
})

describe("changedTurns", () => {
  const v = (turns: ReadonlyArray<ConversationTurn>): PodcastVersion => ({
    n: 1,
    speakers: [...ESSAY],
    turns: [...turns],
    answers: [],
  })

  it("names reworded, retaken, moved, added and removed turns", () => {
    expect(changedTurns(v([ask, take, close]), v([ask, take, close]))).toEqual(
      []
    )
    expect(
      changedTurns(v([ask, take, close]), v([reworded, retaken, close]))
    ).toEqual(["k1", "o1"])
    expect(changedTurns(v([ask, take, close]), v([take, ask, close]))).toEqual([
      "o1",
      "k1",
      "k2",
    ])
    expect(changedTurns(v([ask, take, close]), v([ask, take]))).toEqual(["k2"])
    expect(
      changedTurns(
        v([ask, take, close]),
        v([{ ...ask, speaker: "mochi" }, take, close])
      )
    ).toEqual(["k1"])
  })
})

describe("parseConversationRecord", () => {
  const events = [
    "topic",
    "pointA",
    "v1",
    "flagAgent",
    "v2rewrote",
    "heard2",
    "green2",
  ].map((n) => ALPHABET[n]!)

  it("reads a kept record into its state", () => {
    const parsed = parseConversationRecord({
      schema: CONVERSATION_RECORD_SCHEMA,
      id: "week-12",
      events,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.state.phase).toBe("green-lit")
    expect(greenLitVersion(parsed.value.state)?.turns[0]).toEqual(reworded)
  })

  it("refuses a record whose log holds an event the machine refuses, naming where", () => {
    const parsed = parseConversationRecord({
      schema: CONVERSATION_RECORD_SCHEMA,
      id: "week-12",
      events: [...events.slice(0, 3), ALPHABET.green2!],
    })
    expect(parsed).toEqual({
      ok: false,
      problems: [
        "events.3: only the newest version, 1, can be green-lit, not 2",
      ],
    })
  })

  it("refuses a turn with a field the spoken card's turn doesn't have", () => {
    const parsed = parseConversationRecord({
      schema: CONVERSATION_RECORD_SCHEMA,
      id: "week-12",
      events: [
        ...events.slice(0, 2),
        {
          event: "version",
          by: "agent",
          at: AT,
          version: {
            n: 1,
            speakers: ESSAY,
            turns: [{ ...ask, segue: "Anyway." }],
            answers: [],
          },
        },
      ],
    })
    expect(parsed.ok).toBe(false)
  })
})

/**
 * What /2 holds (#3567). Family, by dimension: an owner turn as a whole take
 * or a span of one (meeting another span or not); a flag on a turn, a
 * speaker or the whole conversation, of one kind or several; each new
 * answer (a recut, conditioning, a corrected transcript, a recast, an
 * unasked change); speakers as roles and stances; the outro and the unused
 * stretches; notes by the agent and by the owner; the measured length; the
 * signature's approvals; and a record kept in /1.
 */
describe("conversation/2", () => {
  const LONG = "take-long"
  const span = (fromMs: number, toMs: number): Span => ({ fromMs, toMs })
  const first: Take = { ...take, id: "o1", take: LONG, span: span(0, 9_000) }
  const second: Take = {
    ...take,
    id: "o2",
    take: LONG,
    span: span(9_500, 20_000),
  }
  const opened = (): ConversationState => {
    const replayed = replayConversation([
      ALPHABET.topic!,
      { event: "point", by: "owner", at: AT, take: LONG },
      ALPHABET.pointA!,
    ])
    if (!replayed.ok) throw new Error(refusalLine(replayed.refusal))
    return replayed.state
  }
  const after = (
    state: ConversationState,
    ...events: ReadonlyArray<ConversationEvent>
  ): ConversationState => {
    let now = state
    for (const event of events) {
      const stepped = stepConversation(now, event)
      if (!stepped.ok) throw new Error(refusalLine(stepped.refusal))
      now = stepped.state
    }
    return now
  }
  const refusal = (
    state: ConversationState,
    event: ConversationEvent
  ): unknown => {
    const stepped = stepConversation(state, event)
    return stepped.ok ? null : stepped.refusal
  }
  const flag = (
    id: string,
    on: ConversationFlag["on"],
    kinds: ConversationFlag["kinds"]
  ): ConversationEvent => ({
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id, on, kinds },
  })
  const v1 = version(1, [ask, first, second, close])

  it("cuts one long take into turns, and refuses two that play the same stretch", () => {
    const state = after(opened(), v1)
    expect(latestVersion(state) && ownerSpans(latestVersion(state)!)).toEqual([
      { turn: "o1", take: LONG, span: span(0, 9_000) },
      { turn: "o2", take: LONG, span: span(9_500, 20_000) },
    ])
    expect(ownerTakes(latestVersion(state)!)).toEqual([LONG])
    expect(
      refusal(
        opened(),
        version(1, [first, { ...second, span: span(8_000, 12_000) }])
      )
    ).toEqual({ why: "take-twice", take: LONG })
    expect(
      refusal(opened(), version(1, [first, { ...take, id: "o2", take: LONG }]))
    ).toEqual({ why: "take-twice", take: LONG })
  })

  it("recuts a choppy turn by a new span of the same take, never the same one", () => {
    const state = after(
      opened(),
      v1,
      flag("cut too soon", { scope: "turn", turn: "o1" }, ["choppy"])
    )
    const recut: Take = { ...first, span: span(0, 9_300) }
    expect(
      stepConversation(
        state,
        version(
          2,
          [ask, recut, second, close],
          [
            {
              flag: "cut too soon",
              how: "retook",
              take: LONG,
              span: recut.span,
            },
          ]
        )
      ).ok
    ).toBe(true)
    expect(
      refusal(
        state,
        version(
          2,
          [ask, first, second, close],
          [
            {
              flag: "cut too soon",
              how: "retook",
              take: LONG,
              span: first.span,
            },
          ]
        )
      )
    ).toEqual({ why: "retook-unplaced", flag: "cut too soon" })
  })

  it("conditions every one of a speaker's turns under one flag of two kinds, and names each", () => {
    const state = after(
      opened(),
      v1,
      flag("f1", { scope: "speaker", speaker: "mochi" }, [
        "too-slow",
        "too-quiet",
      ])
    )
    const louder = { tempo: 1.5, loudnessLufs: -16, gapMostMs: 600 }
    expect(
      stepConversation(
        state,
        version(
          2,
          [
            ask,
            { ...first, conditioning: louder },
            { ...second, conditioning: louder },
            close,
          ],
          [{ flag: "f1", how: "conditioned" }]
        )
      ).ok
    ).toBe(true)
    // Conditioning no flag asked for is a change nobody named.
    const quiet = after(opened(), v1, ALPHABET.flagAgent!)
    expect(
      refusal(
        quiet,
        version(
          2,
          [reworded, { ...first, conditioning: louder }, second, close],
          [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
        )
      )
    ).toEqual({ why: "change-unnamed", turn: "o1" })
  })

  it("keeps each kind of a flag to its voice and scope", () => {
    const state = after(opened(), v1)
    expect(
      refusal(
        state,
        flag("f1", { scope: "turn", turn: "o1" }, ["too-fast", "unhuman"])
      )
    ).toEqual({ why: "flag-voice", flag: "f1", kind: "unhuman" })
    expect(
      refusal(state, flag("f1", { scope: "turn", turn: "k1" }, ["voice"]))
    ).toEqual({ why: "flag-scope", flag: "f1", kind: "voice", scope: "turn" })
    expect(
      refusal(
        state,
        flag("f1", { scope: "speaker", speaker: "nobody" }, ["unhuman"])
      )
    ).toEqual({ why: "flag-speaker-unknown", flag: "f1", speaker: "nobody" })
    // "Applies to all of them": every one of the agent's lines.
    const all = after(
      state,
      flag("f1", { scope: "conversation" }, ["pedantry"])
    )
    expect(
      stepConversation(
        all,
        version(
          2,
          [reworded, first, second, { ...close, said: "So the line moved." }],
          [{ flag: "f1", how: "rewrote", turns: ["k1", "k2"] }]
        )
      ).ok
    ).toBe(true)
    expect(
      refusal(
        all,
        version(
          2,
          [ask, first, second, close],
          [{ flag: "f1", how: "retook", take: LONG }]
        )
      )
    ).toEqual({
      why: "answer-kind",
      flag: "f1",
      kind: "pedantry",
      how: "retook",
    })
  })

  it("recasts a speaker in another Kokoro voice, naming its turns", () => {
    const state = after(
      opened(),
      v1,
      flag("not michael", { scope: "speaker", speaker: "tin" }, ["voice"])
    )
    const recast = ESSAY.map((s) =>
      s.id === "tin"
        ? { ...s, voice: { kind: "kokoro" as const, id: "bm_george" as const } }
        : s
    )
    expect(
      stepConversation(
        state,
        version(
          2,
          [ask, first, second, close],
          [{ flag: "not michael", how: "recast" }],
          recast
        )
      ).ok
    ).toBe(true)
    expect(
      refusal(
        state,
        version(
          2,
          [ask, first, second, close],
          [{ flag: "not michael", how: "recast" }]
        )
      )
    ).toEqual({ why: "recast-unchanged", flag: "not michael" })
  })

  it("corrects a mis-transcribed turn's words, its audio as it was", () => {
    const state = after(
      opened(),
      v1,
      flag("f1", { scope: "turn", turn: "o2" }, ["mis-transcribed"])
    )
    expect(
      stepConversation(
        state,
        version(
          2,
          [
            ask,
            first,
            { ...second, transcript: "Runners, not rummers." },
            close,
          ],
          [{ flag: "f1", how: "corrected" }]
        )
      ).ok
    ).toBe(true)
    // A correction changes the words shown, never the audio, and changes them.
    const louder = { tempo: 1.2, loudnessLufs: -16, gapMostMs: 280 }
    for (const unfixed of [
      second,
      { ...second, conditioning: louder },
      { ...second, transcript: "Runners, not rummers.", conditioning: louder },
    ])
      expect(
        refusal(
          state,
          version(
            2,
            [ask, first, unfixed, close],
            [{ flag: "f1", how: "corrected" }]
          )
        )
      ).toEqual({ why: "corrected-unplaced", flag: "f1" })
  })

  it("names a change no flag asked for, and refuses naming one that didn't change", () => {
    // A version still comes only to answer flags; beside its answers it may
    // name a change of its own ("outro").
    const state = after(opened(), v1, ALPHABET.flagAgent!)
    const kept: FlagAnswer = { flag: "f1", how: "kept", note: "It's clear." }
    const outro: Line = { ...close, said: "What would you build next?" }
    const answer: Take = { ...take, id: "o9", take: "take-a" }
    expect(
      stepConversation(
        state,
        version(
          2,
          [ask, first, second, outro, answer],
          [
            kept,
            {
              how: "unasked",
              turns: ["k2", "o9"],
              note: "The outro asks you.",
            },
          ]
        )
      ).ok
    ).toBe(true)
    expect(
      refusal(
        state,
        version(
          2,
          [ask, first, second, close],
          [kept, { how: "unasked", turns: ["k1"], note: "Nothing, really." }]
        )
      )
    ).toEqual({ why: "unasked-unchanged", turn: "k1" })
  })

  it("speaks Tin Bird in three roles, each a stance and a voice, and refuses a role twice or one its character lacks", () => {
    const personas: ReadonlyArray<ConversationSpeaker> = [
      {
        id: "verdict",
        character: "tin-owlet",
        role: "analyst",
        stance: "verdict",
        voice: { kind: "kokoro", id: "bm_george" },
      },
      {
        id: "build",
        character: "tin-owlet",
        role: "presenter",
        stance: "build",
        voice: { kind: "kokoro", id: "am_puck" },
      },
      {
        id: "challenge",
        character: "tin-owlet",
        role: "coach",
        stance: "challenge",
        voice: { kind: "kokoro", id: "bf_emma" },
      },
      { id: "mochi", character: "mochi", voice: { kind: "owner" } },
    ]
    const turns = [
      { ...ask, speaker: "verdict" },
      first,
      { ...close, speaker: "challenge" },
    ]
    expect(stepConversation(opened(), version(1, turns, [], personas)).ok).toBe(
      true
    )
    const twice = personas.map((s) =>
      s.id === "build" ? { ...s, role: "analyst" as const } : s
    )
    expect(refusal(opened(), version(1, turns, [], twice))).toEqual({
      why: "cast-twice",
      character: "tin-owlet",
      role: "analyst",
    })
    expect(
      refusal(
        opened(),
        version(
          1,
          turns,
          [],
          [
            ...personas,
            {
              id: "sparrow",
              character: "tin-sparrow",
              role: "coach",
              voice: { kind: "kokoro" },
            },
          ]
        )
      )
    ).toEqual({ why: "role-unknown", speaker: "sparrow", role: "coach" })
  })

  it("ends on the outro: the agent's question, then the owner's own answer", () => {
    const outro = (
      n: number,
      extra: Partial<PodcastVersion>
    ): ConversationEvent => ({
      event: "version",
      by: "agent",
      at: AT,
      version: {
        n,
        speakers: [...ESSAY],
        turns: [ask, first, close, second],
        answers: [],
        ...extra,
      },
    })
    expect(
      stepConversation(
        opened(),
        outro(1, { outro: { ask: "k2", answer: "o2" } })
      ).ok
    ).toBe(true)
    expect(
      refusal(opened(), outro(1, { outro: { ask: "k1", answer: "o2" } }))
    ).toEqual({ why: "outro-misplaced" })
    expect(
      refusal(
        opened(),
        outro(1, {
          outro: { ask: "k2", answer: "o2" },
          turns: [
            ask,
            first,
            close,
            { ...second, reads: { said: "Thanks.", kind: "audience" } },
          ],
        })
      )
    ).toEqual({ why: "outro-misplaced" })
    expect(
      refusal(
        opened(),
        outro(1, {
          unused: [
            { take: "take-z", span: span(0, 1_000), reason: "Off topic." },
          ],
        })
      )
    ).toEqual({ why: "unused-unknown", take: "take-z" })
  })

  it("keeps every note the agent proposes, each word's latest standing, under approved rules only", () => {
    const green = after(opened(), v1, ALPHABET.heard1!, ALPHABET.green1!)
    // Before the owner approves a rule, no note can follow it.
    expect(refusal(green, ALPHABET.notesAgent!)).toEqual({
      why: "notes-rule",
      rule: "verdict-close-up",
    })
    const state = after(green, ALPHABET.approveA!, ALPHABET.notesAgent!)
    expect(lineNotes(state, "k1").get(0)?.stress).toBe(0.6)
    const settled = after(state, ALPHABET.notesRuled!)
    expect(lineNotes(settled, "k1").get(0)).toEqual({
      at: 0,
      notes: [{ emotion: "perplexed", weight: 0.5 }],
    })
    if (settled.phase === "new") throw new Error("no record")
    expect(settled.notes).toHaveLength(2)
    const note = (
      turn: string,
      words: Extract<ConversationEvent, { event: "notes" }>["words"]
    ): ConversationEvent => ({
      event: "notes",
      by: "agent",
      at: AT,
      turn,
      words,
      rules: ["verdict-close-up"],
    })
    // Tin Bird has no mochi's own beats; "What changed in week twelve?" has
    // five words.
    expect(
      refusal(
        state,
        note("k1", [{ at: 1, notes: [{ emotion: "question", weight: 1 }] }])
      )
    ).toEqual({ why: "notes-emotion", turn: "k1", emotion: "question" })
    expect(refusal(state, note("k1", [{ at: 5, stress: 1 }]))).toEqual({
      why: "notes-word",
      turn: "k1",
      at: 5,
    })
    expect(refusal(state, note("k9", [{ at: 0, stress: 1 }]))).toEqual({
      why: "notes-turn",
      turn: "k9",
    })
  })

  it("green-lights only a version home has measured, within the length bound", () => {
    const state = after(opened(), v1)
    expect(refusal(state, ALPHABET.green1!)).toEqual({
      why: "unheard",
      version: 1,
    })
    const long = after(state, {
      event: "heard",
      by: "home",
      at: AT,
      version: 1,
      ms: CONVERSATION_POLICY.mostMs + 1,
    })
    expect(refusal(long, ALPHABET.green1!)).toEqual({
      why: "too-long",
      ms: CONVERSATION_POLICY.mostMs + 1,
    })
    expect(refusal(long, ALPHABET.heard1!)).toEqual({
      why: "heard-again",
      version: 1,
    })
    expect(refusal(state, ALPHABET.heard2!)).toEqual({
      why: "heard-version",
      expected: 1,
      got: 2,
    })
    const settled = after(state, ALPHABET.heard1!, ALPHABET.green1!)
    expect(heardMs(settled)).toBe(60_000)
    // The signature's approvals, each preview once.
    const approved = after(settled, ALPHABET.approveA!)
    expect(refusal(approved, ALPHABET.approveA!)).toEqual({
      why: "preview-again",
      preview: "close-up-on-verdict",
    })
    expect(approvedRules(approved)).toEqual(["verdict-close-up"])
    // "Something else", in the owner's words, sets no rule.
    const elsewise = after(settled, {
      event: "approve",
      by: "owner",
      at: AT,
      preview: "transitions",
      offered: ["crossfade", "slow-crossfade", "cut"],
      recommended: "crossfade",
      chose: { kind: "else", said: "Softer, like a page turning." },
    })
    expect(approvedRules(elsewise)).toEqual([])
    expect(
      refusal(settled, {
        event: "approve",
        by: "owner",
        at: AT,
        preview: "transitions",
        offered: ["crossfade", "cut"],
        recommended: "crossfade",
        chose: { kind: "variant", variant: "wipe", rule: "joins" },
      })
    ).toEqual({
      why: "preview-variant",
      preview: "transitions",
      variant: "wipe",
    })
  })

  it("takes the owner's long spoken notes, free flag ids and a line's evidence", () => {
    const note = "word ".repeat(600).trim()
    expect(note.length).toBeGreaterThan(2_900)
    const sourced: Line = {
      ...ask,
      evidence: [{ url: "https://github.com/paulgsc/some-ui/pull/3572" }],
    }
    const state = after(opened(), version(1, [sourced, first, close]))
    expect(
      stepConversation(state, {
        event: "flag",
        by: "owner",
        version: 1,
        at: AT,
        flag: {
          id: "Too fast, v2",
          on: { scope: "turn", turn: "o1" },
          kinds: ["too-fast"],
          note,
        },
      }).ok
    ).toBe(true)
  })

  it("answers a flag of several kinds kind by kind, and closes it once each is", () => {
    // The owner's case: a whole conversation too quiet, and unhuman.
    const state = after(
      opened(),
      v1,
      flag("f1", { scope: "conversation" }, ["too-quiet", "unhuman"])
    )
    const louder = { tempo: 1.2, loudnessLufs: -16, gapMostMs: 280 }
    const fixed = [
      reworded,
      { ...first, conditioning: louder },
      { ...second, conditioning: louder },
      { ...close, said: "So the line moved." },
    ]
    const conditioned: FlagAnswer = {
      flag: "f1",
      kinds: ["too-quiet"],
      how: "conditioned",
    }
    const rewrote: FlagAnswer = {
      flag: "f1",
      kinds: ["unhuman"],
      how: "rewrote",
      turns: ["k1", "k2"],
    }
    expect(
      stepConversation(state, version(2, fixed, [conditioned, rewrote])).ok
    ).toBe(true)
    expect(refusal(state, version(2, fixed, [conditioned]))).toEqual({
      why: "unanswered",
      flag: "f1",
    })
    expect(
      refusal(
        state,
        version(2, fixed, [
          conditioned,
          { ...conditioned, how: "kept", note: "No." },
        ])
      )
    ).toEqual({ why: "answer-twice", flag: "f1" })
    expect(
      refusal(
        state,
        version(2, fixed, [{ ...conditioned, kinds: ["too-fast"] }, rewrote])
      )
    ).toEqual({ why: "answer-kinds", flag: "f1", kind: "too-fast" })
  })

  it("lands a flag on the version the owner heard, never a newer one", () => {
    const state = after(opened(), v1, ALPHABET.flagAgent!)
    const v2 = version(
      2,
      [reworded, first, second, close],
      [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
    )
    // Studio's flag on v1's k1, sent after v2 reached home.
    expect(
      refusal(after(state, v2), {
        ...eventOf("flagLater", "flag"),
        version: 1,
      })
    ).toEqual({ why: "flag-version", flag: "f3", expected: 2, got: 1 })
  })

  it("takes each kind of event from its author only (C1581)", () => {
    expect(
      refusal(opened(), { event: "point", by: "agent", at: AT, take: "take-z" })
    ).toEqual({ why: "author", event: "point", by: "agent" })
    expect(refusal(opened(), { ...v1, by: "owner" })).toEqual({
      why: "author",
      event: "version",
      by: "owner",
    })
    const green = after(opened(), v1, ALPHABET.heard1!, ALPHABET.green1!)
    expect(refusal(green, { ...ALPHABET.heard1!, by: "owner" })).toEqual({
      why: "author",
      event: "heard",
      by: "owner",
    })
    expect(
      refusal(after(green, ALPHABET.approveA!), {
        ...ALPHABET.notesAgent!,
        by: "owner",
      })
    ).toEqual({ why: "author", event: "notes", by: "owner" })
  })

  it("refuses notes on a turn whose words the record doesn't hold", () => {
    const signed = after(
      opened(),
      v1,
      ALPHABET.heard1!,
      ALPHABET.green1!,
      ALPHABET.approveA!
    )
    // o1 is a span of the owner's take, with no transcript kept here.
    expect(
      refusal(signed, { ...eventOf("notesAgent", "notes"), turn: "o1" })
    ).toEqual({
      why: "notes-word",
      turn: "o1",
      at: 0,
    })
  })

  it("sets a rule anew only by naming the approval it moves", () => {
    const signed = after(
      opened(),
      v1,
      ALPHABET.heard1!,
      ALPHABET.green1!,
      ALPHABET.approveA!
    )
    const again = {
      ...eventOf("approveA", "approve"),
      preview: "close-up-on-verdict-2",
    }
    expect(refusal(signed, again)).toEqual({
      why: "rule-again",
      rule: "verdict-close-up",
    })
    expect(
      stepConversation(signed, { ...again, moves: "close-up-on-verdict" }).ok
    ).toBe(true)
  })

  // A record main's /1 code wrote and reads (`sample/conversation`), lifted.
  // Family: read as kept; saved again; a /2 version past its boundary,
  // unmeasured; a /2 record claiming /1's rules for events /1 never kept;
  // a boundary past its events.
  const V1_RECORD: unknown = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../sample/conversation/v1-week-12.json"),
      "utf8"
    )
  )

  it("reads a record kept in /1, lifted, its events under /1's rules", () => {
    const parsed = parseConversationRecord(V1_RECORD)
    if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
    expect(parsed.value.state.phase).toBe("flagged")
    expect(parsed.value.record.lifted).toEqual({
      from: CONVERSATION_RECORD_SCHEMA_V1,
      through: 6,
    })
    expect(parsed.value.record.events[3]).toEqual({
      event: "flag",
      by: "owner",
      at: "2026-11-25T18:30:00.000Z",
      version: 1,
      flag: {
        id: "f1",
        on: { scope: "turn", turn: "k1" },
        kinds: ["assumes-context"],
        note: "Which line?",
      },
    })
    // Saved again as it was read, it reads the same.
    const again = parseConversationRecord(
      JSON.parse(JSON.stringify(parsed.value.record))
    )
    if (!again.ok) throw new Error(again.problems.join("\n"))
    expect(again.value.state).toEqual(parsed.value.state)
    // /1 is frozen: a field only /2 has is refused in it.
    expect(
      parseConversationRecord({
        schema: CONVERSATION_RECORD_SCHEMA_V1,
        id: "week-12",
        events: [ALPHABET.topic],
      }).ok
    ).toBe(false)
  })

  it("holds every event past the lift to /2's rules: a new version needs its measure", () => {
    const parsed = parseConversationRecord(V1_RECORD)
    if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
    const v3: ConversationEvent = {
      event: "version",
      by: "agent",
      at: AT,
      version: {
        n: 3,
        speakers: [...ESSAY],
        turns: [reworded, take, close],
        answers: [{ flag: "f2", how: "conditioned" }],
      },
    }
    const green3: ConversationEvent = {
      event: "green-light",
      by: "owner",
      at: AT,
      version: 3,
    }
    const record = {
      ...parsed.value.record,
      events: [...parsed.value.record.events, v3, green3],
    }
    expect(parseConversationRecord(record)).toEqual({
      ok: false,
      problems: [
        "events.7: version 3 can't be green-lit before home has measured its audio",
      ],
    })
  })

  it("refuses a record claiming /1's rules for events /1 never kept", () => {
    // A native /2 record marked lifted, to take /1's rules for a /2 event
    // (a measured length /1 never had). A record of events /1 could keep
    // is /1's own history, which /1 green-lit unmeasured.
    const events = ["topic", "pointA", "v1", "heard1", "green1"].map(
      (n) => ALPHABET[n]!
    )
    expect(
      parseConversationRecord({
        schema: CONVERSATION_RECORD_SCHEMA,
        id: "week-12",
        lifted: { from: CONVERSATION_RECORD_SCHEMA_V1, through: 5 },
        events,
      })
    ).toEqual({
      ok: false,
      problems: ["events.3: it is marked lifted from /1, and /1 never kept it"],
    })
    expect(
      parseConversationRecord({
        schema: CONVERSATION_RECORD_SCHEMA,
        id: "week-12",
        lifted: { from: CONVERSATION_RECORD_SCHEMA_V1, through: 9 },
        events,
      }).ok
    ).toBe(false)
  })
})
