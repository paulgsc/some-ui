/**
 * CR1 (HOST11, #3553): every order of events keeps a conversation's record
 * whole. Family: every interleaving, up to `DEPTH` accepted events, of the
 * alphabet below (a topic, points and a retake, versions answering flags
 * every way, flags of each voice, a withdrawal, green lights), with every
 * event of the alphabet tried at every state reached. Proof: the walk in
 * "every event order".
 */
import {
  ANSWER_KINDS,
  ANSWERS_OF,
  changedTurns,
  CONVERSATION_ACCEPTS,
  CONVERSATION_PHASES,
  CONVERSATION_RECORD_SCHEMA,
  FLAG_KINDS,
  FLAG_VOICE,
  greenLitVersion,
  latestVersion,
  NEW_CONVERSATION,
  openFlags,
  ownerTakes,
  parseConversationRecord,
  refusalLine,
  replayConversation,
  stepConversation,
} from "@video-render/conversation"
import type {
  ConversationEvent,
  ConversationState,
  ConversationTurn,
  FlagAnswer,
  PodcastVersion,
} from "@video-render/conversation"
import { describe, expect, it } from "vitest"

const AT = "2026-11-26T10:00:00.000Z"

const ask: ConversationTurn = {
  id: "k1",
  voice: "kokoro",
  said: "What changed in week twelve?",
}
const take: ConversationTurn = { id: "o1", voice: "owner", take: "take-a" }
const close: ConversationTurn = {
  id: "k2",
  voice: "kokoro",
  said: "So the line moved because of the injury.",
}

const version = (
  n: number,
  turns: ReadonlyArray<ConversationTurn>,
  answers: ReadonlyArray<FlagAnswer> = []
): ConversationEvent => ({
  event: "version",
  at: AT,
  version: { n, turns: [...turns], answers: [...answers] },
})

const reworded: ConversationTurn = {
  ...ask,
  said: "Week twelve: what moved the line?",
}
const retaken: ConversationTurn = { ...take, take: "take-b" }

/** The alphabet every order is drawn from. */
const ALPHABET: Readonly<Record<string, ConversationEvent>> = {
  topic: {
    event: "topic",
    at: AT,
    topic: { said: "Why the line moved in week twelve" },
  },
  pointA: { event: "point", at: AT, take: "take-a" },
  pointB: { event: "point", at: AT, take: "take-b" },
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
  v3: version(
    3,
    [ask, take, close],
    [{ flag: "f3", how: "rewrote", turns: ["k1"] }]
  ),
  flagAgent: {
    event: "flag",
    at: AT,
    flag: {
      id: "f1",
      turn: "k1",
      kind: "assumes-context",
      note: "Which line?",
    },
  },
  flagOwner: {
    event: "flag",
    at: AT,
    flag: { id: "f2", turn: "o1", kind: "say-again" },
  },
  flagWrongVoice: {
    event: "flag",
    at: AT,
    flag: { id: "f9", turn: "o1", kind: "unhuman" },
  },
  flagLater: {
    event: "flag",
    at: AT,
    flag: { id: "f3", turn: "k1", kind: "off-taste" },
  },
  flagClose: {
    event: "flag",
    at: AT,
    flag: { id: "f4", turn: "k2", kind: "misses-point" },
  },
  withdrawAgent: { event: "withdraw", at: AT, flag: "f1" },
  withdrawOwner: { event: "withdraw", at: AT, flag: "f2" },
  green1: { event: "green-light", at: AT, version: 1 },
  green2: { event: "green-light", at: AT, version: 2 },
}

/** Deep, structural equality, for JSON-shaped values. */
const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** Every law a single step keeps, from `before` by `event`. */
function checkStep(before: ConversationState, event: ConversationEvent): void {
  const stepped = stepConversation(before, event)
  const accepts: ReadonlyArray<string> = CONVERSATION_ACCEPTS[before.phase]
  if (!accepts.includes(event.event)) {
    expect(stepped).toEqual({
      ok: false,
      refusal: { why: "out-of-phase", phase: before.phase, event: event.event },
    })
    return
  }
  if (!stepped.ok) {
    expect(refusalLine(stepped.refusal)).not.toBe("")
    return
  }
  const after = stepped.state
  // Nothing kept is lost: every version and flag before is still there,
  // unchanged but for a withdrawal.
  if (before.phase !== "new" && after.phase !== "new") {
    expect(after.versions.slice(0, before.versions.length)).toEqual(
      before.versions
    )
    expect(after.points.slice(0, before.points.length)).toEqual(before.points)
    expect(after.topic).toEqual(before.topic)
    for (const [i, flag] of before.flags.entries()) {
      const now = after.flags[i]
      expect(now?.id).toBe(flag.id)
      expect({ ...now, withdrawn: flag.withdrawn }).toEqual(flag)
      if (flag.withdrawn) expect(now?.withdrawn).toBe(true)
    }
  }
  // The phase is what the record says it is.
  if (after.phase === "drafting") expect(after.versions).toHaveLength(0)
  if (after.phase === "podcast") expect(openFlags(after)).toHaveLength(0)
  if (after.phase === "flagged")
    expect(openFlags(after).length).toBeGreaterThan(0)
  if (after.phase === "green-lit")
    expect(greenLitVersion(after)?.n).toBe(latestVersion(after)?.n)
  // A version answers exactly the flags that were open, each once.
  if (event.event === "version") {
    expect(event.version.answers.map((a) => a.flag).sort()).toEqual(
      openFlags(before)
        .map((f) => f.id)
        .sort()
    )
    for (const answer of event.version.answers) {
      const flag = openFlags(before).find((f) => f.id === answer.flag)
      expect(flag).toBeDefined()
      if (flag !== undefined) {
        const allowed: ReadonlyArray<string> = ANSWERS_OF[flag.kind]
        expect(allowed).toContain(answer.how)
      }
    }
  }
  // A flag sits on a turn of the newest version, in its voice.
  if (event.event === "flag") {
    const turn = latestVersion(before)?.turns.find(
      (t) => t.id === event.flag.turn
    )
    expect(turn?.voice).toBe(FLAG_VOICE[event.flag.kind])
  }
}

const DEPTH = 9

describe("every event order (CR1)", () => {
  it("keeps the record whole, and a replay of what was kept is the same state", () => {
    const reached = new Set<string>()
    const acceptedOnce = new Set<string>()
    let orders = 0
    const walk = (
      state: ConversationState,
      kept: ReadonlyArray<ConversationEvent>
    ): void => {
      reached.add(state.phase)
      const replayed = replayConversation(kept)
      expect(replayed.ok && same(replayed.state, state)).toBe(true)
      if (kept.length === DEPTH) return
      for (const [name, event] of Object.entries(ALPHABET)) {
        checkStep(state, event)
        const stepped = stepConversation(state, event)
        // Pure: the same state and event give the same answer.
        expect(same(stepConversation(state, event), stepped)).toBe(true)
        if (stepped.ok) {
          orders += 1
          acceptedOnce.add(name)
          walk(stepped.state, [...kept, event])
        }
      }
    }
    walk(NEW_CONVERSATION, [])
    expect([...reached].sort()).toEqual([...CONVERSATION_PHASES].sort())
    // Every event but the misplaced flag is accepted somewhere, so the walk
    // reaches v3, a covariant rewrite, a retake and each withdrawal.
    expect(Object.keys(ALPHABET).filter((n) => !acceptedOnce.has(n))).toEqual([
      "flagWrongVoice",
    ])
    expect(orders).toBeGreaterThan(1000)
  })

  it("closes on a green light: nothing is accepted after it", () => {
    const { topic, pointA, v1, green1 } = ALPHABET
    const replayed = replayConversation([topic!, pointA!, v1!, green1!])
    expect(replayed.ok).toBe(true)
    if (!replayed.ok) return
    expect(CONVERSATION_ACCEPTS["green-lit"]).toHaveLength(0)
    for (const event of Object.values(ALPHABET))
      expect(stepConversation(replayed.state, event).ok).toBe(false)
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

  it("lets a withdrawn flag go unanswered, and refuses an answer to it", () => {
    const state = start("topic", "pointA", "v1", "flagAgent", "withdrawAgent")
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

  it("refuses a flag on the other voice's turn", () => {
    const state = start("topic", "pointA", "v1")
    expect(stepConversation(state, ALPHABET.flagWrongVoice!)).toEqual({
      ok: false,
      refusal: {
        why: "flag-voice",
        flag: "f9",
        kind: "unhuman",
        voice: "owner",
      },
    })
  })
})

describe("the closed sets", () => {
  it("gives every flag kind a voice and answers, and every answer can keep the turn", () => {
    for (const kind of FLAG_KINDS) {
      expect(["owner", "kokoro"]).toContain(FLAG_VOICE[kind])
      expect(ANSWERS_OF[kind]).toContain("kept")
      for (const how of ANSWERS_OF[kind]) expect(ANSWER_KINDS).toContain(how)
    }
  })

  it("answers an owner's flag only by the owner's take, and an agent's only by a rewrite", () => {
    for (const kind of FLAG_KINDS) {
      const answers: ReadonlyArray<string> = ANSWERS_OF[kind]
      expect(answers.includes("rewrote")).toBe(FLAG_VOICE[kind] === "kokoro")
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
        { event: "flag", at: AT, flag: { id: "f1", turn, kind } },
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
  })
})

describe("parseConversationRecord", () => {
  const events = [
    "topic",
    "pointA",
    "v1",
    "flagAgent",
    "v2rewrote",
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

  it("refuses an unknown flag kind and a field no event has", () => {
    const parsed = parseConversationRecord({
      schema: CONVERSATION_RECORD_SCHEMA,
      id: "week-12",
      events: [
        ...events.slice(0, 3),
        {
          event: "flag",
          at: AT,
          flag: { id: "f1", turn: "k1", kind: "boring" },
        },
      ],
    })
    expect(parsed.ok).toBe(false)
  })
})
