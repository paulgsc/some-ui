/**
 * The record's step, as a corpus home's step is held to (HOST16-S,
 * paulgsc/server#1243; the coordinator's ruling on paulgsc/server#1245).
 *
 * Home keeps every conversation's record and replays it before it keeps an
 * event (paulgsc/server `conversation_repo::step`). It ports the step's
 * structural rules and trusts the writers, who run `stepConversation`, for
 * the rules on this repository's closed vocabularies (paulgsc/server
 * `docs/conversations.md`, invariant 4). Nothing but this corpus holds the
 * two steps to each other: it walks every order of an alphabet of events,
 * from each of `CORPUS_SEEDS` up to `CORPUS_DEPTH` accepted events past it,
 * through `stepConversation`, and records
 * what the step answers to every event of the alphabet at every state it
 * reaches. `pnpm dump:conversation-refusals` writes it; the server keeps a
 * copy that its step's tests replay, and its `check_client_fixtures.py`
 * fails a copy that is not this dump.
 *
 * What home must answer to a case is the server's to hold: an event this
 * step takes, home takes; one it refuses under a rule home holds, home
 * refuses the same way; one it refuses under a rule home trusts the writers
 * for, home may take.
 */

import type {
  ConversationEvent,
  ConversationRefusal,
  ConversationSpeaker,
  ConversationState,
  ConversationTurn,
  FlagAnswer,
} from "./conversation"
import {
  ConversationEventSchema,
  NEW_CONVERSATION,
  stepConversation,
} from "./conversation"

export const CONVERSATION_CORPUS_SCHEMA = "some-ui.conversation-refusals/1"

/** How many accepted events deep the walk goes past each seed. */
export const CORPUS_DEPTH = 4

/**
 * Where the walk starts: a new record, and one green-lit, so the
 * signature's rules (offers, picks that move, rules set twice) are within
 * the depth without walking every order of the podcast before them.
 */
export const CORPUS_SEEDS: ReadonlyArray<ReadonlyArray<string>> = [
  [],
  ["topic", "pointA", "v1", "heard1", "green1"],
]

const AT = "2026-11-26T10:00:00.000Z"

const ESSAY: ReadonlyArray<ConversationSpeaker> = [
  { id: "tin", character: "tin-owlet", voice: { kind: "kokoro" } },
  { id: "mochi", character: "mochi", voice: { kind: "owner" } },
]

const ask: Extract<ConversationTurn, { voice: "kokoro" }> = {
  id: "k1",
  speaker: "tin",
  voice: "kokoro",
  said: "What changed in week twelve?",
}
const take: ConversationTurn = {
  id: "o1",
  speaker: "mochi",
  voice: "owner",
  take: "take-a",
}
const close: ConversationTurn = {
  id: "k2",
  speaker: "tin",
  voice: "kokoro",
  said: "So the line moved because of the injury.",
}
const reworded: ConversationTurn = {
  ...ask,
  said: "Week twelve: what moved the line?",
}

const version = (
  n: number,
  turns: ReadonlyArray<ConversationTurn>,
  answers: ReadonlyArray<FlagAnswer> = []
): ConversationEvent => ({
  event: "version",
  by: "agent",
  at: AT,
  version: {
    n,
    speakers: [...ESSAY],
    turns: [...turns],
    answers: [...answers],
  },
})

const offer = (
  preview: string,
  variants: ReadonlyArray<readonly [string, string]>
): ConversationEvent => ({
  event: "offer",
  by: "agent",
  at: AT,
  offer: {
    preview,
    about: "How the verdict is framed",
    recommended: variants[0]?.[0] ?? "",
    variants: variants.map(([variant, rule]) => ({
      variant,
      title: variant,
      callouts: [`Verdict: ${variant}`],
      rule,
    })),
  },
})

const approve = (
  preview: string,
  variant: string,
  moves?: string
): ConversationEvent => ({
  event: "approve",
  by: "owner",
  at: AT,
  preview,
  chose: { kind: "variant", variant },
  ...(moves === undefined ? {} : { moves }),
})

/**
 * The alphabet the walk draws from: each kind of event, by each author, in
 * shapes each rule either side holds takes and refuses.
 */
export const CORPUS_ALPHABET: Readonly<Record<string, ConversationEvent>> = {
  topic: {
    event: "topic",
    by: "owner",
    at: AT,
    topic: { said: "Why the line moved in week twelve" },
  },
  topicByAgent: {
    event: "topic",
    by: "agent",
    at: AT,
    topic: { said: "Why the line moved in week twelve" },
  },
  pointA: { event: "point", by: "owner", at: AT, take: "take-a" },
  v1: version(1, [ask, take, close]),
  v2rewrote: version(
    2,
    [reworded, take, close],
    [{ flag: "f1", how: "rewrote", turns: ["k1"] }]
  ),
  v2kept: version(
    2,
    [ask, take, close],
    [{ flag: "f1", how: "kept", note: "The question is the week's own." }]
  ),
  v2unanswered: version(2, [ask, take, close]),
  flagAgent: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: {
      id: "f1",
      on: { scope: "turn", turn: "k1" },
      kinds: ["assumes-context"],
    },
  },
  flagWrongVoice: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id: "f9", on: { scope: "turn", turn: "o1" }, kinds: ["unhuman"] },
  },
  flagLate: {
    event: "flag",
    by: "owner",
    version: 2,
    at: AT,
    flag: { id: "f3", on: { scope: "turn", turn: "k1" }, kinds: ["off-taste"] },
  },
  flagNoTurn: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: { id: "f4", on: { scope: "turn", turn: "k9" }, kinds: ["echo"] },
  },
  flagTwoKinds: {
    event: "flag",
    by: "owner",
    version: 1,
    at: AT,
    flag: {
      id: "f6",
      on: { scope: "turn", turn: "k2" },
      kinds: ["not-salient", "misses-point"],
    },
  },
  v2half: version(
    2,
    [ask, take, close],
    [
      {
        flag: "f6",
        kinds: ["not-salient"],
        how: "kept",
        note: "It is the point.",
      },
    ]
  ),
  v2both: version(
    2,
    [ask, take, close],
    [
      {
        flag: "f6",
        kinds: ["not-salient"],
        how: "kept",
        note: "It is the point.",
      },
      { flag: "f6", kinds: ["misses-point"], how: "kept", note: "It says it." },
    ]
  ),
  v2twice: version(
    2,
    [ask, take, close],
    [
      {
        flag: "f6",
        kinds: ["not-salient"],
        how: "kept",
        note: "It is the point.",
      },
      { flag: "f6", kinds: ["not-salient"], how: "kept", note: "Said again." },
    ]
  ),
  v2foreign: version(
    2,
    [ask, take, close],
    [{ flag: "f6", kinds: ["echo"], how: "kept", note: "Not an echo." }]
  ),
  withdrawAgent: { event: "withdraw", by: "owner", at: AT, flag: "f1" },
  heard1: { event: "heard", by: "home", at: AT, version: 1, ms: 60_000 },
  heard2: { event: "heard", by: "home", at: AT, version: 2, ms: 60_000 },
  heardLong: {
    event: "heard",
    by: "home",
    at: AT,
    version: 1,
    ms: 30 * 60_000,
  },
  heardByOwner: { event: "heard", by: "owner", at: AT, version: 1, ms: 60_000 },
  green1: { event: "green-light", by: "owner", at: AT, version: 1 },
  green2: { event: "green-light", by: "owner", at: AT, version: 2 },
  stale: {
    event: "point",
    by: "owner",
    at: AT,
    basis: 1,
    take: "take-b",
  },
  offerA: offer("verdict", [
    ["close-up", "verdict-close-up"],
    ["corner", "verdict-corner"],
  ]),
  offerB: offer("verdict-again", [
    ["wide", "verdict-wide"],
    ["close-up", "verdict-close-up"],
  ]),
  approveA: approve("verdict", "close-up"),
  approveACorner: approve("verdict", "corner"),
  approveAMoved: approve("verdict", "corner", "verdict"),
  approveAMovesNothing: approve("verdict", "corner", "nothing"),
  approveUnknown: approve("framing", "close-up"),
  approveNoVariant: approve("verdict", "dutch"),
  approveBSameRule: approve("verdict-again", "close-up"),
  approveBMovesA: approve("verdict-again", "close-up", "verdict"),
  notesRuled: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k1",
    words: [{ at: 0, stress: 0.6 }],
    rules: ["verdict-close-up"],
  },
  notesUnruled: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k1",
    words: [{ at: 0, stress: 0.6 }],
    rules: ["verdict-wide"],
  },
  notesNoTurn: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k9",
    words: [{ at: 0, stress: 0.6 }],
    rules: ["verdict-close-up"],
  },
  notesNoWord: {
    event: "notes",
    by: "agent",
    at: AT,
    turn: "k1",
    words: [{ at: 40, stress: 0.6 }],
    rules: ["verdict-close-up"],
  },
}

/** One case: from the state `path` reaches, what the step answers to `next`. */
export type CorpusCase = {
  /** The path and the event tried, as one name: `topic>v1|flagAgent`. */
  readonly id: string
  /** The alphabet's events the step took, in order. */
  readonly path: ReadonlyArray<string>
  /** The alphabet's event tried next. */
  readonly next: string
  /** Why the step refused it, or null when it took it. */
  readonly refusal: ConversationRefusal | null
}

/** An offer the schema is asked to read: whether it takes it. */
export type OfferProbe = {
  readonly id: string
  readonly event: unknown
  readonly takes: boolean
}

const goodOffer = {
  preview: "verdict",
  about: "How the verdict is framed",
  recommended: "close-up",
  variants: [
    {
      variant: "close-up",
      title: "Close-up",
      callouts: ["Verdict: close-up"],
      rule: "verdict-close-up",
    },
    {
      variant: "corner",
      title: "In the corner",
      callouts: ["Verdict: corner"],
      rule: "verdict-corner",
    },
  ],
}

const variantOf = (n: number): object => ({
  variant: `v${String(n)}`,
  title: `Variant ${String(n)}`,
  callouts: [`Callout ${String(n)}`],
  rule: `rule-${String(n)}`,
})

/**
 * Offers at and past each of `PreviewOfferSchema`'s bounds, as the agent
 * might write one: what this repository's schema takes of each, which
 * home's reader must take too.
 */
const OFFER_SHAPES: Readonly<Record<string, object>> = {
  good: goodOffer,
  threeVariants: {
    ...goodOffer,
    variants: [...goodOffer.variants, variantOf(3)],
  },
  oneVariant: { ...goodOffer, variants: [goodOffer.variants[0]] },
  fourVariants: {
    ...goodOffer,
    variants: [...goodOffer.variants, variantOf(3), variantOf(4)],
  },
  recommendedNotOffered: { ...goodOffer, recommended: "wide" },
  variantTwice: {
    ...goodOffer,
    variants: [goodOffer.variants[0], goodOffer.variants[0]],
  },
  ruleTwice: {
    ...goodOffer,
    variants: [
      goodOffer.variants[0],
      { ...goodOffer.variants[1], rule: "verdict-close-up" },
    ],
  },
  aboutAt80: { ...goodOffer, about: "x".repeat(80) },
  aboutAt81: { ...goodOffer, about: "x".repeat(81) },
  aboutPadded: { ...goodOffer, about: "  How the verdict is framed  " },
  aboutBlank: { ...goodOffer, about: "   " },
  titleAt60: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], title: "t".repeat(60) },
      goodOffer.variants[1],
    ],
  },
  titleAt61: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], title: "t".repeat(61) },
      goodOffer.variants[1],
    ],
  },
  noCallouts: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], callouts: [] },
      goodOffer.variants[1],
    ],
  },
  twelveCallouts: {
    ...goodOffer,
    variants: [
      {
        ...goodOffer.variants[0],
        callouts: Array.from({ length: 12 }, (_, i) => `c${String(i)}`),
      },
      goodOffer.variants[1],
    ],
  },
  thirteenCallouts: {
    ...goodOffer,
    variants: [
      {
        ...goodOffer.variants[0],
        callouts: Array.from({ length: 13 }, (_, i) => `c${String(i)}`),
      },
      goodOffer.variants[1],
    ],
  },
  calloutTwice: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], callouts: ["same", "same"] },
      goodOffer.variants[1],
    ],
  },
  calloutAt81: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], callouts: ["c".repeat(81)] },
      goodOffer.variants[1],
    ],
  },
  ruleAt65: {
    ...goodOffer,
    variants: [
      { ...goodOffer.variants[0], rule: "r".repeat(65) },
      goodOffer.variants[1],
    ],
  },
  previewNotAnId: { ...goodOffer, preview: "The Verdict" },
  variantNotAnId: {
    ...goodOffer,
    recommended: "Close Up",
    variants: [
      { ...goodOffer.variants[0], variant: "Close Up" },
      goodOffer.variants[1],
    ],
  },
  extraField: { ...goodOffer, clip: "close-up.mp4" },
}

/** Each of `OFFER_SHAPES` as an offer event, and whether the schema takes it. */
export const offerProbes = (): ReadonlyArray<OfferProbe> =>
  Object.entries(OFFER_SHAPES).map(([id, offer]) => {
    const event = { event: "offer", by: "agent", at: AT, offer }
    return {
      id,
      event,
      takes: ConversationEventSchema.safeParse(event).success,
    }
  })

export type ConversationCorpus = {
  readonly schema: typeof CONVERSATION_CORPUS_SCHEMA
  readonly depth: number
  readonly seeds: ReadonlyArray<ReadonlyArray<string>>
  readonly alphabet: Readonly<Record<string, ConversationEvent>>
  readonly cases: ReadonlyArray<CorpusCase>
  readonly offers: ReadonlyArray<OfferProbe>
}

/**
 * Every state up to `depth` accepted events of the alphabet, by its first
 * path, and the step's answer to every event of the alphabet there, each
 * refusal once per state. A state
 * a seed's walk reaches twice is walked once, so the corpus grows with the
 * states, not the orders.
 */
export function conversationCorpus(
  depth: number = CORPUS_DEPTH
): ConversationCorpus {
  const names = Object.keys(CORPUS_ALPHABET)
  const cases: Array<CorpusCase> = []
  // Each seed's walk keeps its own: one seed reaching another's start must
  // not leave that seed's states unwalked.
  let seen = new Set<string>()
  const walk = (
    state: ConversationState,
    path: ReadonlyArray<string>,
    deepest: number
  ): void => {
    const key = JSON.stringify(state)
    if (seen.has(key)) return
    seen.add(key)
    const next: Array<[string, ConversationState]> = []
    // A refusal the same at this state for two events is kept once: the
    // step refused both before their contents differed (the phase, the
    // author). Every event the step takes is kept.
    const refused = new Set<string>()
    for (const name of names) {
      const event = CORPUS_ALPHABET[name]
      if (event === undefined) continue
      const stepped = stepConversation(state, event)
      if (!stepped.ok) {
        const key = JSON.stringify(stepped.refusal)
        if (refused.has(key)) continue
        refused.add(key)
      }
      cases.push({
        id: `${path.join(">")}|${name}`,
        path,
        next: name,
        refusal: stepped.ok ? null : stepped.refusal,
      })
      if (stepped.ok) next.push([name, stepped.state])
    }
    if (path.length >= deepest) return
    for (const [name, after] of next) walk(after, [...path, name], deepest)
  }
  for (const seed of CORPUS_SEEDS) {
    seen = new Set<string>()
    let state = NEW_CONVERSATION
    for (const name of seed) {
      const event = CORPUS_ALPHABET[name]
      const stepped = event && stepConversation(state, event)
      if (!stepped?.ok)
        throw new Error(`seed ${seed.join(">")} refuses ${name}`)
      state = stepped.state
    }
    walk(state, seed, seed.length + depth)
  }
  return {
    schema: CONVERSATION_CORPUS_SCHEMA,
    depth,
    seeds: CORPUS_SEEDS,
    alphabet: CORPUS_ALPHABET,
    cases,
    offers: offerProbes(),
  }
}
