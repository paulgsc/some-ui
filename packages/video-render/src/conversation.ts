/**
 * A conversation essay's record (HOST11, paulgsc/some-ui#3553; epic #3521):
 * the one record that steps 1 to 6 of the owner's model move through, from a
 * topic to the podcast version the owner green-lights, and on to the
 * signature over it. The owner, 2026-11-25: "a video is like a two-step
 * process. You need to decide on what the conversation should be like before
 * we green light it to become a video".
 *
 * 1. **Topic** (`topic`): the owner motivates it in a Claude conversation.
 * 2. **Points** (`point`): the owner's spoken takes, an unordered set, each
 *    by the id home keeps it under, whole.
 * 3. **Podcast vN** (`version`): the agent's turns in order, its retorts and
 *    the segues between the owner's takes. An owner turn plays a span of a
 *    take (`span`), so one long take is cut into several turns, conditioned
 *    (`conditioning`: tempo, loudness, the longest gap). The order and the
 *    segues are the agent's editorial work, never the owner's (the owner:
 *    "that is not on my end. That remains an editorial task by the AI").
 * 4. **Flags** (`flag`, `withdraw`): the owner flags a turn, a speaker or the
 *    whole conversation of the newest version, by one or more of a closed
 *    set of kinds keyed by voice, with an optional note.
 * 5. **Podcast vN+1** (`version`): the agent's next version answers every
 *    open flag, saying how (`ANSWERS_OF`), and may change any turn, since a
 *    flag can ripple through the whole conversation ("covariant", the
 *    owner's word); a change no flag asked for is named too (`unasked`).
 *    Back to 4, until home has measured the version's audio (`heard`) and
 *    the owner green-lights (`green-light`) it with no open flag.
 * 6. **The signature**: the owner never sets a value (the owner's guard on
 *    #3521: no video editor). The agent proposes each line's emotion notes
 *    (`notes`) under the rules the owner approved, and where a rule is new
 *    or in doubt offers a preview of two or three variants, each with the
 *    rule it would set (`offer`); the owner picks one, which sets its rule,
 *    or says what else they want (`approve`, #3558). The owner only chooses:
 *    every rule's name is the agent's, in the offer.
 *
 * The family. A turn is the spoken card's turn (`SpokenTurnSchema` in
 * `cut-list.ts`: a line home's Kokoro says, or the owner's take by its id),
 * given an id that lasts across versions so a flag and its answer can name
 * it, and spoken by one of the version's speakers: a cast member in a role,
 * with a stance and a voice. The record holds any number of speakers (the
 * owner, 2026-11-26, on #3521: a short drama's ensemble is the same record);
 * an essay is its case of Mochi in the owner's takes and Tin Bird
 * (`tin-owlet`) in Kokoro's lines, Tin Bird in as many roles as it has
 * stances (an analyst's verdict, a presenter's build, a coach's challenge,
 * C1562). The flags are keyed by a voice, not by who speaks it.
 *
 * The record is an append-only log of events (`ConversationRecord`), and its
 * state is the log replayed through `stepConversation`, a pure function. A
 * flag never edits a turn, a later note never edits an earlier one, and nothing edits
 * a version: each version, flag, withdrawal, note and approval stays in the
 * log (CLAUDE.md, "Never lose the record"). Where the log is kept is C1535.
 * A record kept as `some-ui.conversation/1` is read by its own frozen schema
 * and lifted into this one's events (`liftV1`), so it replays as it did.
 *
 * The phases and events are closed unions; which events a phase accepts is
 * one table (`CONVERSATION_ACCEPTS`), and a refused event is a closed union too
 * (`ConversationRefusal`). The proof that every order of events keeps the record whole is
 * `__tests__/conversation.test.ts` (CR1).
 */

import { assertNever, canonicalJson } from "@some-ui/core-utils"
import { CHARACTERS } from "@some-ui/styles/brand/cast"
import {
  EMOTIONS,
  HOST_CHARACTERS,
  SHARED_EMOTIONS,
  type HostCharacter,
} from "@some-ui/styles/brand/host"
import type { WordSpan } from "@some-ui/styles/brand/host-live"
import { ROLES } from "@some-ui/styles/brand/host-role"
import { z } from "zod"

import { ClaimSourceSchema } from "./claims"
import { problemsOf, SayableSchema, SpokenTurnSchema } from "./cut-list"
import type { Parsed, TimedWord } from "./cut-list"
import { showId, words } from "./format"
import { KOKORO_VOICES } from "./voices"

/** The record's schema. */
export const CONVERSATION_RECORD_SCHEMA = "some-ui.conversation/2"

/** The schema records were first kept in, which still read (`liftV1`). */
export const CONVERSATION_RECORD_SCHEMA_V1 = "some-ui.conversation/1"

/**
 * How much one conversation holds: policy, moved with the story (C771).
 * Forty turns is about a twenty-minute podcast at thirty seconds a turn,
 * twice the ten minutes the owner named (2026-11-25).
 */
export const CONVERSATION_POLICY = {
  /** The most turns one version has. */
  turnsMost: 40,
  /** The most points (takes) the owner gives one conversation, retakes included. */
  pointsMost: 40,
  /**
   * The most characters a topic, a note or a kept answer's reason runs: the
   * owner's spoken notes run to about 3,000 (C1563, moving 600).
   */
  noteMost: 4000,
  /**
   * The most speakers one version has: an essay has two cast members, Tin
   * Bird in up to three roles, and a short drama's ensemble a few more.
   */
  speakersMost: 8,
  /**
   * The longest podcast a version may be green-lit at, as home measured its
   * audio (`heard`), never estimated from its words (C1563, #3555): the
   * forty turns above at thirty seconds each.
   */
  mostMs: 20 * 60_000,
  /** The most sources one line names. */
  evidenceMost: 8,
  /** The most unused stretches of the owner's takes one version lists. */
  unusedMost: 200,
  /** The most emotions one word carries. */
  notesPerWordMost: 3,
} as const

/**
 * The kinds of flag (the owner, 2026-11-25 and 2026-11-26). On the owner's
 * own turns: too quiet, too fast or slow, say it again, choppy (a bad cut),
 * mis-transcribed (the words shown are wrong, the audio right). On the
 * agent's: not salient, assumes context the listener lacks, unhuman
 * phrasing, off-taste, misses the point, an echo ("you've just rehashed what
 * I said"), too thin ("too bare bones… afraid of saying anything"), pedantry
 * (dates and hashes read aloud), and the voice a speaker is said in. Whose
 * turns each goes on is `FLAG_VOICE`, and what it covers `FLAG_SCOPES`.
 */
export const FLAG_KINDS = [
  "too-quiet",
  "too-fast",
  "too-slow",
  "say-again",
  "choppy",
  "mis-transcribed",
  "not-salient",
  "assumes-context",
  "unhuman",
  "off-taste",
  "misses-point",
  "echo",
  "too-thin",
  "pedantry",
  "voice",
] as const

export type FlagKind = (typeof FLAG_KINDS)[number]

/** A turn's voice: the agent's (Kokoro's) line, or the owner's take. */
export type ConversationVoice = z.infer<typeof SpokenTurnSchema>["voice"]

/** The voice whose turns each kind of flag is raised on. */
export const FLAG_VOICE = {
  "too-quiet": "owner",
  "too-fast": "owner",
  "too-slow": "owner",
  "say-again": "owner",
  choppy: "owner",
  "mis-transcribed": "owner",
  "not-salient": "kokoro",
  "assumes-context": "kokoro",
  unhuman: "kokoro",
  "off-taste": "kokoro",
  "misses-point": "kokoro",
  echo: "kokoro",
  "too-thin": "kokoro",
  pedantry: "kokoro",
  voice: "kokoro",
} as const satisfies Readonly<Record<FlagKind, ConversationVoice>>

/** What a flag covers: one turn, every turn of one speaker, or every turn ("applies to all of them"). */
export const FLAG_SCOPE_KINDS = ["turn", "speaker", "conversation"] as const
export type FlagScopeKind = (typeof FLAG_SCOPE_KINDS)[number]

/**
 * What each kind of flag may cover. A retake, a recut or a corrected
 * transcript is one turn's; a voice is a speaker's; how a line or a take
 * sounds may be raised on one, a speaker's, or all.
 */
export const FLAG_SCOPES = {
  "too-quiet": FLAG_SCOPE_KINDS,
  "too-fast": FLAG_SCOPE_KINDS,
  "too-slow": FLAG_SCOPE_KINDS,
  "say-again": ["turn"],
  choppy: ["turn"],
  "mis-transcribed": ["turn"],
  "not-salient": FLAG_SCOPE_KINDS,
  "assumes-context": FLAG_SCOPE_KINDS,
  unhuman: FLAG_SCOPE_KINDS,
  "off-taste": FLAG_SCOPE_KINDS,
  "misses-point": FLAG_SCOPE_KINDS,
  echo: FLAG_SCOPE_KINDS,
  "too-thin": FLAG_SCOPE_KINDS,
  pedantry: FLAG_SCOPE_KINDS,
  voice: ["speaker"],
} as const satisfies Readonly<Record<FlagKind, ReadonlyArray<FlagScopeKind>>>

/**
 * How a version answers a flag. A version names every turn it changed, by its
 * answers, so a change nobody named can't slip in; a rewrite may reach past
 * the flagged turn. `retook` plays a new take, or a new span of one, in the
 * flagged turn; `conditioned` plays the same span louder, faster or slower
 * (HOST12, #3554); `corrected` fixes the words shown for the same span;
 * `recast` says a speaker's lines in another voice; `kept` leaves what was
 * flagged as it was, and says why.
 */
export const ANSWER_KINDS = [
  "rewrote",
  "retook",
  "conditioned",
  "corrected",
  "recast",
  "kept",
] as const
export type AnswerKind = (typeof ANSWER_KINDS)[number]

/** Which answers each kind of flag can take. Every flag can be kept, with a reason. */
export const ANSWERS_OF = {
  "too-quiet": ["conditioned", "retook", "kept"],
  "too-fast": ["conditioned", "retook", "kept"],
  "too-slow": ["conditioned", "retook", "kept"],
  "say-again": ["retook", "kept"],
  choppy: ["retook", "kept"],
  "mis-transcribed": ["corrected", "kept"],
  "not-salient": ["rewrote", "kept"],
  "assumes-context": ["rewrote", "kept"],
  unhuman: ["rewrote", "kept"],
  "off-taste": ["rewrote", "kept"],
  "misses-point": ["rewrote", "kept"],
  echo: ["rewrote", "kept"],
  "too-thin": ["rewrote", "kept"],
  // Moving the dates and hashes to a card is a rewrite of the line.
  pedantry: ["rewrote", "kept"],
  voice: ["recast", "kept"],
} as const satisfies Readonly<Record<FlagKind, ReadonlyArray<AnswerKind>>>

const answersOf = (kind: FlagKind): ReadonlyArray<AnswerKind> =>
  ANSWERS_OF[kind]

const scopesOf = (kind: FlagKind): ReadonlyArray<FlagScopeKind> =>
  FLAG_SCOPES[kind]

/** The stance a speaker takes (the owner, 2026-11-26): an empirical verdict, a builder's grammar for the owner's point, a skeptic's challenge. */
export const SPEAKER_STANCES = ["verdict", "build", "challenge"] as const
export type SpeakerStance = (typeof SPEAKER_STANCES)[number]

const isHost = (character: string): character is HostCharacter =>
  HOST_CHARACTERS.some((c) => c === character)

/** Every role any character plays (HOST7); which are a character's own is `rolesOf`. */
const RoleSchema = z.union([z.enum(ROLES["tin-owlet"]), z.enum(ROLES.mochi)])

/** Every emotion any character has (HOST1); which are a character's own is `emotionsOf`. */
const EmotionSchema = z.union([
  z.enum(EMOTIONS["tin-owlet"]),
  z.enum(EMOTIONS.mochi),
])

/** A character's emotions: its own in the cast, else the shared ones. */
export const emotionsOf = (character: string): ReadonlyArray<string> =>
  isHost(character) ? EMOTIONS[character] : SHARED_EMOTIONS

/** A character's roles, none for a character without any. */
const rolesOf = (character: string): ReadonlyArray<string> =>
  isHost(character) ? ROLES[character] : []

/** A turn's or a speaker's id, a name the agent gives it, which lasts across versions: `k1`, `o3`, `tin`. */
const IdSchema = showId

/** A flag's id: any short name, as Studio or the agent writes it ("too fast v2"). */
const FlagIdSchema = z.string().trim().min(1).max(64)

const NoteSchema = words.max(CONVERSATION_POLICY.noteMost)

const [KokoroTurnSchema, OwnerTurnSchema] = SpokenTurnSchema.options

const TakeSchema = OwnerTurnSchema.shape.take

const Ms = z.number().int().nonnegative()

/**
 * A stretch of one of the owner's takes, in ms from its start: cut on the
 * take's own silences (HOST12), so stored by time, its words derived from
 * home's transcript.
 */
export const SpanSchema = z
  .strictObject({ fromMs: Ms, toMs: Ms })
  .refine((s) => s.fromMs < s.toMs, "the span ends before it starts")

export type Span = z.infer<typeof SpanSchema>

/**
 * How an owner's span is played (HOST12, #3554): its tempo (1.5 is half
 * again as fast), the loudness it is brought to, and the longest silence
 * kept inside it.
 */
export const ConditioningSchema = z.strictObject({
  tempo: z.number().min(0.5).max(2),
  loudnessLufs: z.number().min(-40).max(-6),
  gapMostMs: z.number().int().min(0).max(10_000),
})

export type Conditioning = z.infer<typeof ConditioningSchema>

/**
 * A line the agent wrote for the owner to read: the abstract, or anything
 * said to the audience ("should also be voiced by me").
 */
export const ReadsSchema = z.strictObject({
  said: SayableSchema,
  kind: z.enum(["abstract", "audience"]),
})

/** What a line rests on: code at a commit's lines, or a page. */
export const EvidenceSchema = z.union([
  ClaimSourceSchema,
  z.strictObject({ url: z.url() }),
])

/**
 * One turn of a version: the spoken card's turn (`SpokenTurnSchema`), a line
 * the agent wrote for Kokoro, with what it rests on, or a span of one of the
 * owner's takes, as conditioned, with the words the agent wrote for it if it
 * is read, and the words shown for it where home's transcript has them
 * wrong.
 */
export const ConversationTurnSchema = z.discriminatedUnion("voice", [
  KokoroTurnSchema.extend({
    id: IdSchema,
    speaker: IdSchema,
    evidence: z
      .array(EvidenceSchema)
      .min(1)
      .max(CONVERSATION_POLICY.evidenceMost)
      .optional(),
  }),
  OwnerTurnSchema.extend({
    id: IdSchema,
    speaker: IdSchema,
    span: SpanSchema.optional(),
    conditioning: ConditioningSchema.optional(),
    reads: ReadsSchema.optional(),
    transcript: SayableSchema.optional(),
  }),
])

/**
 * How a speaker's turns are voiced: the owner's own takes, or the lines the
 * agent writes said in one of Kokoro's voices; a record kept in /1 names no
 * voice, which the essay's voice policy chose.
 */
export const SpeakerVoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("owner") }),
  z.strictObject({
    kind: z.literal("kokoro"),
    id: z.enum(KOKORO_VOICES).optional(),
  }),
])

export type SpeakerVoice = z.infer<typeof SpeakerVoiceSchema>

/**
 * One of a version's speakers: a cast member (`CHARACTERS`) in one of its
 * roles (HOST7), the stance its turns take, and how they are voiced. Each
 * cast member in each role is at most one speaker of a version.
 */
export const ConversationSpeakerSchema = z.strictObject({
  id: IdSchema,
  character: z.enum(CHARACTERS),
  role: RoleSchema.optional(),
  stance: z.enum(SPEAKER_STANCES).optional(),
  voice: SpeakerVoiceSchema,
})

export type ConversationSpeaker = z.infer<typeof ConversationSpeakerSchema>

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>

/** What a flag covers. */
export const FlagScopeSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("turn"), turn: IdSchema }),
  z.strictObject({ scope: z.literal("speaker"), speaker: IdSchema }),
  z.strictObject({ scope: z.literal("conversation") }),
])

export type FlagScope = z.infer<typeof FlagScopeSchema>

/** A flag the owner raised on the newest version, of one kind or several ("too fast… and raise the volume"). */
export const ConversationFlagSchema = z.strictObject({
  id: FlagIdSchema,
  on: FlagScopeSchema,
  kinds: z
    .array(z.enum(FLAG_KINDS))
    .min(1)
    .max(FLAG_KINDS.length)
    .refine((k) => new Set(k).size === k.length, "a kind is named twice"),
  note: NoteSchema.optional(),
})

export type ConversationFlag = z.infer<typeof ConversationFlagSchema>

const TurnsNamed = z
  .array(IdSchema)
  .min(1)
  // A whole new version changes every turn it has and every one it drops.
  .max(2 * CONVERSATION_POLICY.turnsMost)

/**
 * How a version answered one flag of the version before it (`ANSWER_KINDS`),
 * or named a change no flag asked for (`unasked`), with why.
 */
/**
 * Which of a flag's kinds an answer answers: every kind when it names none.
 * A flag of several kinds may take an answer for each ("too fast… and raise
 * the volume" conditioned, "and that line is unhuman" rewritten), and is
 * answered once every kind is.
 */
const AnswerKindsSchema = z
  .array(z.enum(FLAG_KINDS))
  .min(1)
  .max(FLAG_KINDS.length)
  .optional()

export const FlagAnswerSchema = z.discriminatedUnion("how", [
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("rewrote"),
    turns: TurnsNamed,
    note: NoteSchema.optional(),
  }),
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("retook"),
    take: TakeSchema,
    span: SpanSchema.optional(),
  }),
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("conditioned"),
    note: NoteSchema.optional(),
  }),
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("corrected"),
    note: NoteSchema.optional(),
  }),
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("recast"),
    note: NoteSchema.optional(),
  }),
  z.strictObject({
    flag: FlagIdSchema,
    kinds: AnswerKindsSchema,
    how: z.literal("kept"),
    note: NoteSchema,
  }),
  z.strictObject({
    how: z.literal("unasked"),
    turns: TurnsNamed,
    note: NoteSchema,
  }),
])

export type FlagAnswer = z.infer<typeof FlagAnswerSchema>

/**
 * One podcast version: its number from 1, its speakers and turns in order,
 * how it answers the flags on the one before, its outro (the agent's last
 * turn asks, the owner's unscripted answer ends it), and the stretches of
 * the owner's takes it leaves out, each with why: the editorial selection.
 */
export const PodcastVersionSchema = z.strictObject({
  n: z.number().int().min(1),
  /** Who speaks in this version: the agent's editorial work, as its turns are. */
  speakers: z
    .array(ConversationSpeakerSchema)
    .min(1)
    .max(CONVERSATION_POLICY.speakersMost),
  turns: z
    .array(ConversationTurnSchema)
    .min(1)
    .max(CONVERSATION_POLICY.turnsMost),
  answers: z.array(FlagAnswerSchema),
  outro: z.strictObject({ ask: IdSchema, answer: IdSchema }).optional(),
  unused: z
    .array(
      z.strictObject({ take: TakeSchema, span: SpanSchema, reason: NoteSchema })
    )
    .max(CONVERSATION_POLICY.unusedMost)
    .optional(),
})

export type PodcastVersion = z.infer<typeof PodcastVersionSchema>

/** What the conversation is about, as the owner set it, and the Claude conversation it was set in. */
export const ConversationTopicSchema = z.strictObject({
  said: NoteSchema,
  chat: z.url().optional(),
})

export type ConversationTopic = z.infer<typeof ConversationTopicSchema>

/**
 * A word's emotion notes (#3567, for HOST5 #3526): how hard it is stressed,
 * and the feelings it carries, each a member of the speaker's character's
 * closed Emotion union, weighted.
 */
export const WordNoteSchema = z
  .strictObject({
    /** The word's index in the turn's words. */
    at: z.number().int().nonnegative(),
    stress: z.number().min(0).max(1).optional(),
    notes: z
      .array(
        z.strictObject({
          emotion: EmotionSchema,
          weight: z.number().min(0).max(1),
        })
      )
      .min(1)
      .max(CONVERSATION_POLICY.notesPerWordMost)
      .optional(),
  })
  .refine(
    (w) => w.stress !== undefined || w.notes !== undefined,
    "a word's note says its stress or its feelings"
  )

export type WordNote = z.infer<typeof WordNoteSchema>

/** A preview's variant's id, or a rule's: a short name the agent gives it. */
const NameSchema = FlagIdSchema

/** The most variants one preview offers the owner (HOST16: two or three). */
export const PREVIEW_VARIANTS_MOST = 3

/** The fewest variants one preview offers: a choice needs two. */
export const PREVIEW_VARIANTS_LEAST = 2

/**
 * One variant of a preview: what it is, what its clip shows, and the rule
 * picking it sets. Its id names its clip on home
 * (`<subject>/<conversation>/<preview>/<variant>.mp4`), so it is folder-safe.
 */
export const PreviewVariantSchema = z.strictObject({
  variant: IdSchema,
  /** What it is, in a few words: "Crossfade". */
  title: words.max(60),
  /** Each moment the clip shows, as its on-screen callout says it. */
  callouts: z
    .array(words.max(80))
    .min(1)
    .max(12)
    .refine((c) => new Set(c).size === c.length, "a callout is listed twice"),
  /** The rule this variant sets once picked. */
  rule: NameSchema,
})

export type PreviewVariant = z.infer<typeof PreviewVariantSchema>

/**
 * A preview the agent offers the owner (HOST16, #3558; C1582): the family
 * of choices it bundles, its variants, and the one recommended. Its id
 * names its folder on home, so it is folder-safe.
 */
export const PreviewOfferSchema = z
  .strictObject({
    preview: IdSchema,
    /** The family of choices it bundles, as the card's heading says it. */
    about: words.max(80),
    variants: z
      .array(PreviewVariantSchema)
      .min(PREVIEW_VARIANTS_LEAST)
      .max(PREVIEW_VARIANTS_MOST),
    recommended: IdSchema,
  })
  .refine(
    (o) => new Set(o.variants.map((v) => v.variant)).size === o.variants.length,
    "two variants share an id"
  )
  .refine(
    (o) => new Set(o.variants.map((v) => v.rule)).size === o.variants.length,
    "two variants set the same rule, so picking between them decides nothing"
  )
  .refine(
    (o) => o.variants.some((v) => v.variant === o.recommended),
    "the recommended variant isn't one offered"
  )

export type PreviewOffer = z.infer<typeof PreviewOfferSchema>

/**
 * What the owner chose on an offered preview (#3558, the owner's guard on
 * #3521: the owner never sets a value, only approves a preview, which
 * becomes a rule): one of its variants, or something else, in the owner's
 * own words, which sets none and asks the agent for another preview.
 */
export const PreviewChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("variant"), variant: IdSchema }),
  z.strictObject({ kind: z.literal("else"), said: NoteSchema }),
])

export type PreviewChoice = z.infer<typeof PreviewChoiceSchema>

/** A choice as the state keeps it: a variant with the rule its offer gave it. */
export type KeptChoice =
  | {
      readonly kind: "variant"
      readonly variant: string
      readonly rule: string
    }
  | Extract<PreviewChoice, { kind: "else" }>

const at = z.iso.datetime()

/**
 * Who writes a record's events: the owner, the agent, or home itself
 * (measuring a version's audio). Which may write each kind is
 * `EVENT_AUTHORS` (C1581): the owner sets the topic, gives points, flags,
 * withdraws, green-lights and approves a preview, and never sets a value
 * (the owner's guard on #3521); the agent writes versions and notes; home
 * measures.
 */
export const AUTHORS = ["owner", "agent", "home"] as const
export type Author = (typeof AUTHORS)[number]

/**
 * When and against what an event was written. `at` is the writer's clock,
 * kept as information and never compared: a phone or an agent whose clock
 * runs behind is never refused for it. The record's order is the log's own,
 * each event's place in it (C1580; paulgsc/server's docs/conveyor.md,
 * invariant 2: moves are ordered by their number, never by a clock).
 * `basis`, where a writer names it, is how many events the log held when
 * it wrote; an event written against an older log is refused by that
 * number (`stale`), never by its time.
 */
const stamp = {
  at,
  basis: z.number().int().nonnegative().optional(),
  by: z.enum(["owner", "agent", "home"]),
}

/** One event of the record, in the order it was kept. */
export const ConversationEventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("topic"),
    ...stamp,
    topic: ConversationTopicSchema,
  }),
  z.strictObject({ event: z.literal("point"), ...stamp, take: TakeSchema }),
  z.strictObject({
    event: z.literal("version"),
    ...stamp,
    version: PodcastVersionSchema,
  }),
  z.strictObject({
    event: z.literal("flag"),
    ...stamp,
    /** The version the owner heard when flagging it: a flag lands on it or nowhere. */
    version: z.number().int().min(1),
    flag: ConversationFlagSchema,
  }),
  z.strictObject({
    event: z.literal("withdraw"),
    ...stamp,
    flag: FlagIdSchema,
  }),
  /** Home measured the version's podcast audio (HOST13): how long it runs. */
  z.strictObject({
    event: z.literal("heard"),
    ...stamp,
    version: z.number().int().min(1),
    ms: z.number().int().positive(),
  }),
  z.strictObject({
    event: z.literal("green-light"),
    ...stamp,
    version: z.number().int().min(1),
  }),
  /**
   * Emotion notes the agent proposes on a turn of the newest version's
   * words, under the rules the owner approved that it names. A later notes
   * event on a word replaces the earlier one; the owner never types one.
   */
  z.strictObject({
    event: z.literal("notes"),
    ...stamp,
    turn: IdSchema,
    words: z.array(WordNoteSchema).min(1),
    rules: z.array(NameSchema).min(1),
  }),
  /**
   * A preview the agent offers the owner to pick from (HOST16; C1582): its
   * variants and the rule each sets, and the one recommended. Home keeps
   * each variant's clip beside it, and refuses an offer whose clips aren't
   * made yet.
   */
  z.strictObject({
    event: z.literal("offer"),
    ...stamp,
    offer: PreviewOfferSchema,
  }),
  /**
   * The owner's pick on an offered preview (HOST16): which variant, or what
   * else they want ("preview approvals as events", #3558). The rule it sets
   * is the offer's, never written here.
   */
  z.strictObject({
    event: z.literal("approve"),
    ...stamp,
    preview: IdSchema,
    chose: PreviewChoiceSchema,
    /** The earlier approval this one changes or moves, by its preview (C1581). */
    moves: IdSchema.optional(),
  }),
])

/** Who may write each kind of event (C1581). */
export const EVENT_AUTHORS = {
  topic: ["owner"],
  point: ["owner"],
  version: ["agent"],
  flag: ["owner"],
  withdraw: ["owner"],
  heard: ["home"],
  "green-light": ["owner"],
  notes: ["agent"],
  offer: ["agent"],
  approve: ["owner"],
} as const satisfies Readonly<
  Record<
    z.infer<typeof ConversationEventSchema>["event"],
    ReadonlyArray<Author>
  >
>

export type ConversationEvent = z.infer<typeof ConversationEventSchema>
export type ConversationEventKind = ConversationEvent["event"]

/** The record as kept: its id and its events, oldest first, never rewritten. */
export const ConversationRecordSchema = z.strictObject({
  schema: z.literal(CONVERSATION_RECORD_SCHEMA),
  id: IdSchema,
  /**
   * A record first kept in /1 and lifted (`liftV1`): its first `through`
   * events replay under /1's rules, so a lifted record saved again reads as
   * it did, and every event after them under /2's. Those first events must
   * be ones a lift makes (`lowerToV1`), so a record can't claim /1's rules
   * for events /1 never kept.
   */
  lifted: z
    .strictObject({
      from: z.literal(CONVERSATION_RECORD_SCHEMA_V1),
      through: z.number().int().nonnegative(),
    })
    .optional(),
  events: z.array(ConversationEventSchema),
})

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>

/** A flag as the state keeps it: the version it was raised on, and whether the owner took it back. */
export type KeptFlag = ConversationFlag & {
  readonly version: number
  readonly withdrawn: boolean
}

/** A notes event as the state keeps it: the version its turn is in. */
export type KeptNotes = {
  readonly version: number
  readonly turn: string
  readonly words: ReadonlyArray<WordNote>
}

/** An approval as the state keeps it. */
export type KeptApproval = {
  readonly preview: string
  readonly chose: KeptChoice
  readonly moves?: string
}

/**
 * The approvals that stand, by preview: each preview's latest, less any a
 * later approval of another preview moved. Every approval stays kept; only
 * the standing ones set rules.
 */
export function standingApprovals(
  approvals: ReadonlyArray<KeptApproval>
): ReadonlyMap<string, KeptApproval> {
  const standing = new Map<string, KeptApproval>()
  for (const a of approvals) {
    if (a.moves !== undefined && a.moves !== a.preview) standing.delete(a.moves)
    standing.set(a.preview, a)
  }
  return standing
}

/** The rules the owner's standing approvals set, in the order set. */
export const approvedRules = (
  state: ConversationState
): ReadonlyArray<string> =>
  state.phase === "new"
    ? []
    : [...standingApprovals(state.approvals).values()].flatMap((a) =>
        a.chose.kind === "variant" ? [a.chose.rule] : []
      )

/** Which schema's rules a record replays under: /1 knew no measured length. */
export type ConversationSchemaVersion = 1 | 2

/** Everything kept once the topic is set; it only grows. */
type Kept = {
  readonly schema: ConversationSchemaVersion
  readonly topic: ConversationTopic
  /** The owner's takes, each once. */
  readonly points: ReadonlyArray<string>
  readonly versions: ReadonlyArray<PodcastVersion>
  readonly flags: ReadonlyArray<KeptFlag>
  /** How long each measured version's audio runs. */
  readonly heard: ReadonlyArray<{
    readonly version: number
    readonly ms: number
  }>
  readonly notes: ReadonlyArray<KeptNotes>
  /** The previews the agent offered, each once. */
  readonly offers: ReadonlyArray<PreviewOffer>
  readonly approvals: ReadonlyArray<KeptApproval>
  /** How many events the log holds: the next one's place in it. */
  readonly seq: number
}

/**
 * Where a conversation stands:
 *
 * - `new`: nothing yet;
 * - `drafting`: the topic is set, the owner gives points, and no version is
 *   written yet;
 * - `podcast`: the newest version waits on the owner, with no open flag;
 * - `flagged`: the newest version has open flags, which the next answers;
 * - `green-lit`: the owner approved a version, and the conversation is
 *   settled: only its signature goes on (notes, offers and approvals).
 */
export type ConversationState =
  | { readonly phase: "new"; readonly schema: ConversationSchemaVersion }
  | ({ readonly phase: "drafting" } & Kept)
  | ({ readonly phase: "podcast" } & Kept)
  | ({ readonly phase: "flagged" } & Kept)
  | ({ readonly phase: "green-lit"; readonly approved: number } & Kept)

export type ConversationPhase = ConversationState["phase"]

/**
 * Which events each phase accepts; every other is refused as out of phase.
 * A new point reaches a version through a flag (say, `misses-point` with a
 * note) or an unasked change, which names it.
 */
export const CONVERSATION_ACCEPTS = {
  new: ["topic"],
  drafting: ["point", "version"],
  podcast: ["point", "flag", "heard", "green-light"],
  flagged: ["point", "flag", "withdraw", "version", "heard"],
  "green-lit": ["notes", "offer", "approve"],
} as const satisfies Readonly<
  Record<ConversationPhase, ReadonlyArray<ConversationEventKind>>
>

/** Why an event was refused. A refused event is never kept. */
export type ConversationRefusal =
  | {
      readonly why: "out-of-phase"
      readonly phase: ConversationPhase
      readonly event: ConversationEventKind
    }
  | { readonly why: "stale"; readonly basis: number; readonly seq: number }
  | { readonly why: "too-many-points" }
  | { readonly why: "point-again"; readonly take: string }
  | {
      readonly why: "version-number"
      readonly expected: number
      readonly got: number
    }
  | { readonly why: "speaker-twice"; readonly speaker: string }
  | {
      readonly why: "cast-twice"
      readonly character: string
      readonly role: string | undefined
    }
  | {
      readonly why: "role-unknown"
      readonly speaker: string
      readonly role: string
    }
  | {
      readonly why: "speaker-unknown"
      readonly turn: string
      readonly speaker: string
    }
  | {
      readonly why: "speaker-voice"
      readonly turn: string
      readonly speaker: string
    }
  | { readonly why: "turn-twice"; readonly turn: string }
  | { readonly why: "take-twice"; readonly take: string }
  | {
      readonly why: "turn-voice"
      readonly turn: string
      readonly voice: ConversationVoice
    }
  | { readonly why: "change-unnamed"; readonly turn: string }
  | {
      readonly why: "take-unknown"
      readonly turn: string
      readonly take: string
    }
  | { readonly why: "unused-unknown"; readonly take: string }
  | { readonly why: "outro-misplaced" }
  | { readonly why: "unanswered"; readonly flag: string }
  | { readonly why: "answer-unknown"; readonly flag: string }
  | { readonly why: "answer-twice"; readonly flag: string }
  | {
      readonly why: "answer-kinds"
      readonly flag: string
      readonly kind: FlagKind
    }
  | {
      readonly why: "answer-kind"
      readonly flag: string
      readonly kind: FlagKind
      readonly how: AnswerKind
    }
  | {
      readonly why: "answer-scope"
      readonly flag: string
      readonly how: AnswerKind
    }
  | {
      readonly why: "rewrote-unchanged"
      readonly flag: string
      readonly turn: string
    }
  | { readonly why: "unasked-unchanged"; readonly turn: string }
  | { readonly why: "retook-unplaced"; readonly flag: string }
  | { readonly why: "conditioned-unplaced"; readonly flag: string }
  | { readonly why: "corrected-unplaced"; readonly flag: string }
  | { readonly why: "recast-unchanged"; readonly flag: string }
  | { readonly why: "kept-changed"; readonly flag: string }
  | { readonly why: "flag-again"; readonly flag: string }
  | {
      readonly why: "turn-unknown"
      readonly flag: string
      readonly turn: string
    }
  | {
      readonly why: "flag-speaker-unknown"
      readonly flag: string
      readonly speaker: string
    }
  | {
      readonly why: "flag-scope"
      readonly flag: string
      readonly kind: FlagKind
      readonly scope: FlagScopeKind
    }
  | {
      readonly why: "flag-voice"
      readonly flag: string
      readonly kind: FlagKind
    }
  | { readonly why: "flag-not-open"; readonly flag: string }
  | {
      readonly why: "heard-version"
      readonly expected: number
      readonly got: number
    }
  | { readonly why: "heard-again"; readonly version: number }
  | { readonly why: "unheard"; readonly version: number }
  | { readonly why: "too-long"; readonly ms: number }
  | {
      readonly why: "green-light-version"
      readonly expected: number
      readonly got: number
    }
  | { readonly why: "notes-turn"; readonly turn: string }
  | { readonly why: "notes-word"; readonly turn: string; readonly at: number }
  | {
      readonly why: "notes-emotion"
      readonly turn: string
      readonly emotion: string
    }
  | { readonly why: "notes-rule"; readonly rule: string }
  | {
      readonly why: "author"
      readonly event: ConversationEventKind
      readonly by: Author
    }
  | {
      readonly why: "flag-version"
      readonly flag: string
      readonly expected: number
      readonly got: number
    }
  | { readonly why: "rule-again"; readonly rule: string }
  | { readonly why: "moves-unknown"; readonly preview: string }
  | { readonly why: "preview-again"; readonly preview: string }
  | { readonly why: "offer-again"; readonly preview: string }
  | { readonly why: "preview-unknown"; readonly preview: string }
  | {
      readonly why: "preview-variant"
      readonly preview: string
      readonly variant: string
    }

export type ConversationStepped =
  | { readonly ok: true; readonly state: ConversationState }
  | { readonly ok: false; readonly refusal: ConversationRefusal }

/** A conversation before its topic, replayed under `schema`'s rules. */
export const newConversation = (
  schema: ConversationSchemaVersion
): ConversationState => ({ phase: "new", schema })

export const NEW_CONVERSATION: ConversationState = newConversation(2)

export const latestVersion = (
  state: ConversationState
): PodcastVersion | null =>
  state.phase === "new" ? null : (state.versions.at(-1) ?? null)

/** The flags the next version has to answer: on the newest version, not taken back. */
export function openFlags(state: ConversationState): ReadonlyArray<KeptFlag> {
  const latest = latestVersion(state)
  if (state.phase === "new" || latest === null) return []
  return state.flags.filter((f) => f.version === latest.n && !f.withdrawn)
}

/** The version the owner green-lit, which the signature (step 6) and the render (step 7) read; null until then. */
export const greenLitVersion = (
  state: ConversationState
): PodcastVersion | null =>
  state.phase === "green-lit"
    ? (state.versions.find((v) => v.n === state.approved) ?? null)
    : null

/** An owner turn's take as played: the take, the span of it, and how it is conditioned. */
export type PlayedSpan = {
  readonly turn: string
  readonly take: string
  readonly span?: Span
  readonly conditioning?: Conditioning
}

/** The spans of the owner's takes a version plays, in order: what HOST12 conditions and HOST13 lays. */
export const ownerSpans = (
  version: PodcastVersion
): ReadonlyArray<PlayedSpan> =>
  version.turns.flatMap((t) =>
    t.voice === "owner"
      ? [
          {
            turn: t.id,
            take: t.take,
            ...(t.span ? { span: t.span } : {}),
            ...(t.conditioning ? { conditioning: t.conditioning } : {}),
          },
        ]
      : []
  )

/** One of a version's turns as heard, its words timed on the video's clock (the speaker's `/timed`, or the take's transcript as played). */
export type TimedTurn = {
  readonly turn: string
  readonly words: ReadonlyArray<TimedWord>
}

/**
 * What `character` hears while it listens (#3580): every word the version's
 * other characters say, in order, as `BeatOf.hears` takes it
 * (`@some-ui/styles/brand/host`), so a listener's play waits for a pause in
 * the whole conversation. A character's own speakers in other roles (Tin
 * Bird the auditor and the skeptic) are itself, never heard. A turn the
 * version doesn't have, or whose speaker it doesn't name, is not heard.
 */
export function hearsOf(
  version: PodcastVersion,
  timed: ReadonlyArray<TimedTurn>,
  character: (typeof CHARACTERS)[number]
): ReadonlyArray<WordSpan> {
  const whose = new Map(version.speakers.map((s) => [s.id, s.character]))
  const by = new Map(version.turns.map((t) => [t.id, whose.get(t.speaker)]))
  return timed
    .filter((t) => {
      const who = by.get(t.turn)
      return who !== undefined && who !== character
    })
    .flatMap((t) => t.words.map(({ startMs, endMs }) => ({ startMs, endMs })))
    .sort((a, b) => a.startMs - b.startMs)
}

/** The owner's takes a version plays, each once, in the order first played. */
export const ownerTakes = (version: PodcastVersion): ReadonlyArray<string> => [
  ...new Set(ownerSpans(version).map((s) => s.take)),
]

/** How long the newest version's audio runs, as home measured it; null before. */
export const heardMs = (state: ConversationState): number | null => {
  const latest = latestVersion(state)
  if (state.phase === "new" || latest === null) return null
  return state.heard.find((h) => h.version === latest.n)?.ms ?? null
}

/**
 * The newest version's emotion notes on `turn`, word by word: each word's
 * latest. Every earlier note stays in the record.
 */
export function lineNotes(
  state: ConversationState,
  turn: string
): ReadonlyMap<number, WordNote> {
  const latest = latestVersion(state)
  const out = new Map<number, WordNote>()
  if (state.phase === "new" || latest === null) return out
  for (const kept of state.notes) {
    if (kept.version !== latest.n || kept.turn !== turn) continue
    for (const word of kept.words) out.set(word.at, word)
  }
  return out
}

/** The speaker of `turn` in `version`, but its id. */
const speakerOf = (
  version: PodcastVersion,
  id: string
): Omit<ConversationSpeaker, "id"> | undefined => {
  const speaker = version.speakers.find((s) => s.id === id)
  if (speaker === undefined) return undefined
  const { id: _id, ...rest } = speaker
  return rest
}

/**
 * Whether turn `a` of version `va` says or plays what `b` of `vb` does, by
 * the same speaker as the same cast member, in the same role, stance and
 * voice.
 */
const sameTurn = (
  a: ConversationTurn,
  va: PodcastVersion,
  b: ConversationTurn,
  vb: PodcastVersion
): boolean => {
  const { id: _a, ...ca } = a
  const { id: _b, ...cb } = b
  return (
    canonicalJson(ca) === canonicalJson(cb) &&
    canonicalJson(speakerOf(va, a.speaker)) ===
      canonicalJson(speakerOf(vb, b.speaker))
  )
}

/**
 * The turns that differ between two versions: added, removed, reworded,
 * retaken, recut, reconditioned or recast, or moved (the turn before it is
 * another), in the newer's order and then the removed ones.
 */
export function changedTurns(
  before: PodcastVersion,
  after: PodcastVersion
): ReadonlyArray<string> {
  type Placed = { readonly turn: ConversationTurn; readonly prev?: string }
  const placed = (v: PodcastVersion): Map<string, Placed> =>
    new Map(
      v.turns.map((t, i) => [t.id, { turn: t, prev: v.turns[i - 1]?.id }])
    )
  const was = placed(before)
  const now = placed(after)
  const changed = after.turns.flatMap((t) => {
    const old = was.get(t.id)
    const moved = old !== undefined && old.prev !== now.get(t.id)?.prev
    return old === undefined || !sameTurn(old.turn, before, t, after) || moved
      ? [t.id]
      : []
  })
  const removed = before.turns.flatMap((t) => (now.has(t.id) ? [] : [t.id]))
  return [...changed, ...removed]
}

/** Whether two plays of one take meet: a whole take meets any other. */
const meets = (a: Span | undefined, b: Span | undefined): boolean =>
  a === undefined || b === undefined || (a.fromMs < b.toMs && b.fromMs < a.toMs)

/**
 * The first thing wrong with `version`'s speakers and turns: a speaker twice,
 * a cast member twice in one role, a role its character lacks, a turn whose
 * speaker isn't the version's or speaks in another voice, a turn id twice, a
 * stretch of a take played twice, a take not one of the points, a turn id an
 * earlier version gave another voice, an outro that isn't the last ask and
 * the owner's unscripted answer, or an unused stretch of a take that isn't a
 * point.
 */
function turnsRefusal(
  version: PodcastVersion,
  kept: Kept
): ConversationRefusal | null {
  const voiceOf = new Map(
    kept.versions.flatMap((v) => v.turns.map((t) => [t.id, t.voice] as const))
  )
  const speakers = new Map<string, ConversationSpeaker>()
  for (const speaker of version.speakers) {
    if (speakers.has(speaker.id))
      return { why: "speaker-twice", speaker: speaker.id }
    if (
      [...speakers.values()].some(
        (s) => s.character === speaker.character && s.role === speaker.role
      )
    )
      return {
        why: "cast-twice",
        character: speaker.character,
        role: speaker.role,
      }
    if (
      speaker.role !== undefined &&
      !rolesOf(speaker.character).includes(speaker.role)
    )
      return { why: "role-unknown", speaker: speaker.id, role: speaker.role }
    speakers.set(speaker.id, speaker)
  }
  const ids = new Set<string>()
  const played: Array<{ readonly take: string; readonly span?: Span }> = []
  for (const turn of version.turns) {
    const speaker = speakers.get(turn.speaker)
    if (speaker === undefined)
      return { why: "speaker-unknown", turn: turn.id, speaker: turn.speaker }
    if (speaker.voice.kind !== turn.voice)
      return { why: "speaker-voice", turn: turn.id, speaker: turn.speaker }
    if (ids.has(turn.id)) return { why: "turn-twice", turn: turn.id }
    ids.add(turn.id)
    const voice = voiceOf.get(turn.id)
    if (voice !== undefined && voice !== turn.voice)
      return { why: "turn-voice", turn: turn.id, voice }
    if (turn.voice === "owner") {
      if (!kept.points.includes(turn.take))
        return { why: "take-unknown", turn: turn.id, take: turn.take }
      if (played.some((p) => p.take === turn.take && meets(p.span, turn.span)))
        return { why: "take-twice", take: turn.take }
      played.push({
        take: turn.take,
        ...(turn.span ? { span: turn.span } : {}),
      })
    }
  }
  if (version.outro !== undefined) {
    const [ask, answer] = version.turns.slice(-2)
    if (
      ask?.id !== version.outro.ask ||
      ask.voice !== "kokoro" ||
      answer?.id !== version.outro.answer ||
      answer.voice !== "owner" ||
      answer.reads !== undefined
    )
      return { why: "outro-misplaced" }
  }
  const unknown = (version.unused ?? []).find(
    (u) => !kept.points.includes(u.take)
  )
  return unknown === undefined
    ? null
    : { why: "unused-unknown", take: unknown.take }
}

/** The turns of `version` a flag covers. */
function inScope(
  flag: ConversationFlag,
  version: PodcastVersion
): ReadonlyArray<ConversationTurn> {
  switch (flag.on.scope) {
    case "turn": {
      const id = flag.on.turn
      return version.turns.filter((t) => t.id === id)
    }
    case "speaker": {
      const id = flag.on.speaker
      return version.turns.filter((t) => t.speaker === id)
    }
    case "conversation": {
      const voices = new Set(flag.kinds.map((k) => FLAG_VOICE[k]))
      return version.turns.filter((t) => voices.has(t.voice))
    }
    default: {
      return assertNever(flag.on)
    }
  }
}

/** Whether `after` plays `turn` from the same span of the same take `before` did. */
const sameSpan = (
  was: ConversationTurn | undefined,
  now: ConversationTurn | undefined
): boolean =>
  was?.voice === "owner" &&
  now?.voice === "owner" &&
  was.take === now.take &&
  was.speaker === now.speaker &&
  canonicalJson(was.span) === canonicalJson(now.span)

/** The first thing wrong with how `version` answers the open flags of `before`. */
function answersRefusal(
  version: PodcastVersion,
  before: PodcastVersion | null,
  open: ReadonlyArray<KeptFlag>
): ConversationRefusal | null {
  const byId = new Map(open.map((f) => [f.id, f]))
  /** The kinds of each flag answered so far. */
  const answered = new Map<string, Set<FlagKind>>()
  const named = new Set<string>()
  const changed = before === null ? [] : changedTurns(before, version)
  const turnIn = (
    v: PodcastVersion | null,
    id: string
  ): ConversationTurn | undefined => v?.turns.find((t) => t.id === id)
  for (const answer of version.answers) {
    if (answer.how === "unasked") {
      const same = answer.turns.find((t) => !changed.includes(t))
      if (same !== undefined) return { why: "unasked-unchanged", turn: same }
      for (const turn of answer.turns) named.add(turn)
      continue
    }
    const flag = byId.get(answer.flag)
    if (flag === undefined) return { why: "answer-unknown", flag: answer.flag }
    // The kinds this answers: those it names, else all of the flag's.
    const kinds = answer.kinds ?? flag.kinds
    const foreign = kinds.find((k) => !flag.kinds.includes(k))
    if (foreign !== undefined)
      return { why: "answer-kinds", flag: flag.id, kind: foreign }
    const done = answered.get(flag.id) ?? new Set<FlagKind>()
    if (kinds.some((k) => done.has(k)))
      return { why: "answer-twice", flag: flag.id }
    answered.set(flag.id, new Set([...done, ...kinds]))
    const asked: KeptFlag = { ...flag, kinds: [...kinds] }
    const refusedKind = asked.kinds.find(
      (k) => !answersOf(k).includes(answer.how)
    )
    if (refusedKind !== undefined)
      return {
        why: "answer-kind",
        flag: flag.id,
        kind: refusedKind,
        how: answer.how,
      }
    const scoped = before === null ? [] : inScope(asked, before)
    switch (answer.how) {
      case "rewrote": {
        const same = answer.turns.find((t) => !changed.includes(t))
        if (same !== undefined)
          return { why: "rewrote-unchanged", flag: flag.id, turn: same }
        for (const turn of answer.turns) named.add(turn)
        break
      }
      case "retook": {
        if (flag.on.scope !== "turn")
          return { why: "answer-scope", flag: flag.id, how: answer.how }
        const placed = turnIn(version, flag.on.turn)
        const was = turnIn(before, flag.on.turn)
        const playedBefore =
          before?.turns.some(
            (t) =>
              t.voice === "owner" &&
              t.take === answer.take &&
              (answer.span === undefined
                ? true
                : canonicalJson(t.span) === canonicalJson(answer.span))
          ) === true
        if (
          placed?.voice !== "owner" ||
          placed.take !== answer.take ||
          canonicalJson(placed.span) !== canonicalJson(answer.span) ||
          placed.speaker !== was?.speaker ||
          playedBefore
        )
          return { why: "retook-unplaced", flag: flag.id }
        named.add(flag.on.turn)
        break
      }
      case "conditioned": {
        if (
          scoped.length === 0 ||
          scoped.some((t) => !sameSpan(t, turnIn(version, t.id)))
        )
          return { why: "conditioned-unplaced", flag: flag.id }
        for (const t of scoped) named.add(t.id)
        break
      }
      case "corrected": {
        // The words shown change, and the audio stays as it was played.
        const fixed = (t: ConversationTurn): boolean => {
          const now = turnIn(version, t.id)
          return (
            sameSpan(t, now) &&
            t.voice === "owner" &&
            now?.voice === "owner" &&
            canonicalJson(t.conditioning) === canonicalJson(now.conditioning) &&
            now.transcript !== undefined &&
            now.transcript !== t.transcript
          )
        }
        if (scoped.length === 0 || !scoped.every(fixed))
          return { why: "corrected-unplaced", flag: flag.id }
        for (const t of scoped) named.add(t.id)
        break
      }
      case "recast": {
        if (flag.on.scope !== "speaker")
          return { why: "answer-scope", flag: flag.id, how: answer.how }
        const id = flag.on.speaker
        const was = before === null ? undefined : speakerOf(before, id)
        const now = speakerOf(version, id)
        if (
          now === undefined ||
          was?.character !== now.character ||
          canonicalJson(was.voice) === canonicalJson(now.voice)
        )
          return { why: "recast-unchanged", flag: flag.id }
        for (const t of version.turns) if (t.speaker === id) named.add(t.id)
        break
      }
      case "kept": {
        // What it says or plays: a rewrite beside it may still move it.
        const speakerSame =
          flag.on.scope !== "speaker" ||
          (before !== null &&
            canonicalJson(speakerOf(before, flag.on.speaker)) ===
              canonicalJson(speakerOf(version, flag.on.speaker)))
        if (
          before === null ||
          !speakerSame ||
          scoped.some((t) => {
            const now = turnIn(version, t.id)
            return now === undefined || !sameTurn(t, before, now, version)
          }) ||
          (flag.on.scope === "turn" && scoped.length === 0)
        )
          return { why: "kept-changed", flag: flag.id }
        break
      }
      default: {
        return assertNever(answer)
      }
    }
  }
  const unanswered = open.find((f) =>
    f.kinds.some((k) => answered.get(f.id)?.has(k) !== true)
  )
  if (unanswered !== undefined)
    return { why: "unanswered", flag: unanswered.id }
  const unnamed = changed.find((t) => !named.has(t))
  return unnamed === undefined ? null : { why: "change-unnamed", turn: unnamed }
}

/** The first thing wrong with where `flag` is raised on `latest`. */
function flagRefusal(
  flag: ConversationFlag,
  latest: PodcastVersion
): ConversationRefusal | null {
  const scope = flag.on.scope
  const misplaced = flag.kinds.find((k) => !scopesOf(k).includes(scope))
  if (misplaced !== undefined)
    return { why: "flag-scope", flag: flag.id, kind: misplaced, scope }
  const voices: ReadonlyArray<ConversationVoice> = (() => {
    switch (flag.on.scope) {
      case "turn": {
        const id = flag.on.turn
        const turn = latest.turns.find((t) => t.id === id)
        return turn === undefined ? [] : [turn.voice]
      }
      case "speaker": {
        const id = flag.on.speaker
        const speaker = latest.speakers.find((s) => s.id === id)
        return speaker === undefined ? [] : [speaker.voice.kind]
      }
      case "conversation": {
        return latest.turns.map((t) => t.voice)
      }
      default: {
        return assertNever(flag.on)
      }
    }
  })()
  if (flag.on.scope === "turn" && voices.length === 0)
    return { why: "turn-unknown", flag: flag.id, turn: flag.on.turn }
  if (flag.on.scope === "speaker" && voices.length === 0)
    return {
      why: "flag-speaker-unknown",
      flag: flag.id,
      speaker: flag.on.speaker,
    }
  const wrong = flag.kinds.find((k) =>
    flag.on.scope === "conversation"
      ? !voices.includes(FLAG_VOICE[k])
      : voices[0] !== FLAG_VOICE[k]
  )
  return wrong === undefined
    ? null
    : { why: "flag-voice", flag: flag.id, kind: wrong }
}

/** A turn's words, as the notes count them, where the record knows them. */
const wordsOf = (turn: ConversationTurn): number | null => {
  const said =
    turn.voice === "kokoro" ? turn.said : (turn.transcript ?? turn.reads?.said)
  return said === undefined ? null : said.split(/\s+/).filter(Boolean).length
}

/** The first thing wrong with a notes event on `latest`. */
function notesRefusal(
  event: Extract<ConversationEvent, { event: "notes" }>,
  latest: PodcastVersion,
  rules: ReadonlyArray<string>
): ConversationRefusal | null {
  const unknownRule = event.rules.find((r) => !rules.includes(r))
  if (unknownRule !== undefined) return { why: "notes-rule", rule: unknownRule }
  const turn = latest.turns.find((t) => t.id === event.turn)
  const character = latest.speakers.find(
    (s) => s.id === turn?.speaker
  )?.character
  if (turn === undefined || character === undefined)
    return { why: "notes-turn", turn: event.turn }
  const count = wordsOf(turn)
  const own = emotionsOf(character)
  const seen = new Set<number>()
  for (const word of event.words) {
    if (seen.has(word.at) || count === null || word.at >= count)
      return { why: "notes-word", turn: event.turn, at: word.at }
    seen.add(word.at)
    const foreign = (word.notes ?? []).find((n) => !own.includes(n.emotion))
    if (foreign !== undefined)
      return {
        why: "notes-emotion",
        turn: event.turn,
        emotion: foreign.emotion,
      }
  }
  return null
}

/** Kept, with its phase derived from its open flags. */
const reviewing = (kept: Kept): ConversationState => {
  const state: ConversationState = { phase: "podcast", ...kept }
  return openFlags(state).length > 0 ? { ...state, phase: "flagged" } : state
}

/**
 * The state after `event`, or why it is refused. Pure: the same state and
 * event give the same answer, and a refused event changes nothing.
 */
export function stepConversation(
  state: ConversationState,
  event: ConversationEvent
): ConversationStepped {
  const accepted: ReadonlyArray<ConversationEventKind> =
    CONVERSATION_ACCEPTS[state.phase]
  const outOfPhase = refused({
    why: "out-of-phase",
    phase: state.phase,
    event: event.event,
  })
  const seq = state.phase === "new" ? 0 : state.seq
  if (event.basis !== undefined && event.basis !== seq)
    return refused({ why: "stale", basis: event.basis, seq })
  const authors: ReadonlyArray<Author> = EVENT_AUTHORS[event.event]
  if (!authors.includes(event.by))
    return refused({ why: "author", event: event.event, by: event.by })
  if (!accepted.includes(event.event)) return outOfPhase
  if (event.event === "topic")
    return ok({
      phase: "drafting",
      schema: state.schema,
      topic: event.topic,
      points: [],
      versions: [],
      flags: [],
      heard: [],
      notes: [],
      offers: [],
      approvals: [],
      seq: 1,
    })
  // `new` accepts only a topic, so this only narrows the type.
  if (state.phase === "new") return outOfPhase
  const kept: Kept = {
    schema: state.schema,
    topic: state.topic,
    points: state.points,
    versions: state.versions,
    flags: state.flags,
    heard: state.heard,
    notes: state.notes,
    offers: state.offers,
    approvals: state.approvals,
    seq: state.seq + 1,
  }
  const latest = latestVersion(state)
  switch (event.event) {
    case "point": {
      if (state.points.includes(event.take))
        return refused({ why: "point-again", take: event.take })
      if (state.points.length >= CONVERSATION_POLICY.pointsMost)
        return refused({ why: "too-many-points" })
      return ok({ ...state, ...kept, points: [...state.points, event.take] })
    }
    case "version": {
      const { version } = event
      const expected = (latest?.n ?? 0) + 1
      if (version.n !== expected)
        return refused({ why: "version-number", expected, got: version.n })
      const wrong =
        turnsRefusal(version, kept) ??
        answersRefusal(version, latest, openFlags(state))
      if (wrong !== null) return refused(wrong)
      return ok({
        phase: "podcast",
        ...kept,
        versions: [...state.versions, version],
      })
    }
    case "flag": {
      const { flag } = event
      if (state.flags.some((f) => f.id === flag.id))
        return refused({ why: "flag-again", flag: flag.id })
      if (latest === null)
        return refused({
          why: "out-of-phase",
          phase: state.phase,
          event: "flag",
        })
      // A flag lands on the version the owner heard, or nowhere: a turn's
      // id outlasts its version, so a late flag on v1's k1 is never v2's.
      if (event.version !== latest.n)
        return refused({
          why: "flag-version",
          flag: flag.id,
          expected: latest.n,
          got: event.version,
        })
      const wrong = flagRefusal(flag, latest)
      if (wrong !== null) return refused(wrong)
      return ok(
        reviewing({
          ...kept,
          flags: [
            ...state.flags,
            { ...flag, version: latest.n, withdrawn: false },
          ],
        })
      )
    }
    case "withdraw": {
      if (!openFlags(state).some((f) => f.id === event.flag))
        return refused({ why: "flag-not-open", flag: event.flag })
      return ok(
        reviewing({
          ...kept,
          flags: state.flags.map((f) =>
            f.id === event.flag ? { ...f, withdrawn: true } : f
          ),
        })
      )
    }
    case "heard": {
      const expected = latest?.n ?? 0
      if (event.version !== expected)
        return refused({
          why: "heard-version",
          expected,
          got: event.version,
        })
      if (state.heard.some((h) => h.version === event.version))
        return refused({ why: "heard-again", version: event.version })
      return ok(
        reviewing({
          ...kept,
          heard: [...state.heard, { version: event.version, ms: event.ms }],
        })
      )
    }
    case "green-light": {
      const expected = latest?.n ?? 0
      if (event.version !== expected)
        return refused({
          why: "green-light-version",
          expected,
          got: event.version,
        })
      if (state.schema === 2) {
        const ms = heardMs(state)
        if (ms === null) return refused({ why: "unheard", version: expected })
        if (ms > CONVERSATION_POLICY.mostMs)
          return refused({ why: "too-long", ms })
      }
      return ok({ phase: "green-lit", ...kept, approved: event.version })
    }
    case "notes": {
      if (latest === null) return outOfPhase
      const wrong = notesRefusal(event, latest, approvedRules(state))
      if (wrong !== null) return refused(wrong)
      const notes: ReadonlyArray<KeptNotes> = [
        ...state.notes,
        { version: latest.n, turn: event.turn, words: event.words },
      ]
      return ok({ ...state, ...kept, notes })
    }
    case "offer": {
      // A preview's id is one offer's: a new preview is a new offer.
      if (state.offers.some((o) => o.preview === event.offer.preview))
        return refused({ why: "offer-again", preview: event.offer.preview })
      return ok({ ...state, ...kept, offers: [...state.offers, event.offer] })
    }
    case "approve": {
      // Checked in this order: the offer, its variant, the move, the pick
      // again, the rule again.
      const offer = state.offers.find((o) => o.preview === event.preview)
      if (offer === undefined)
        return refused({ why: "preview-unknown", preview: event.preview })
      const chose: KeptChoice | null = (() => {
        if (event.chose.kind === "else") return event.chose
        const variant = event.chose.variant
        const offered = offer.variants.find((v) => v.variant === variant)
        return offered === undefined
          ? null
          : { kind: "variant", variant, rule: offered.rule }
      })()
      if (chose === null)
        return refused({
          why: "preview-variant",
          preview: event.preview,
          variant:
            event.chose.kind === "variant"
              ? event.chose.variant
              : event.preview,
        })
      const standing = standingApprovals(state.approvals)
      // A pick is changed by a new approval that names the one it moves:
      // the earlier one stays kept, and the latest sets the rule.
      if (event.moves !== undefined && !standing.has(event.moves))
        return refused({ why: "moves-unknown", preview: event.moves })
      if (standing.has(event.preview) && event.moves !== event.preview)
        return refused({ why: "preview-again", preview: event.preview })
      if (chose.kind === "variant") {
        const rule = chose.rule
        const setBy = [...standing.values()].find(
          (a) =>
            a.preview !== event.preview &&
            a.chose.kind === "variant" &&
            a.chose.rule === rule
        )
        if (setBy !== undefined && event.moves !== setBy.preview)
          return refused({ why: "rule-again", rule })
      }
      const approval: KeptApproval = {
        preview: event.preview,
        chose,
        ...(event.moves === undefined ? {} : { moves: event.moves }),
      }
      return ok({
        ...state,
        ...kept,
        approvals: [...state.approvals, approval],
      })
    }
    default: {
      return assertNever(event)
    }
  }
}

const ok = (state: ConversationState): ConversationStepped => ({
  ok: true,
  state,
})
const refused = (refusal: ConversationRefusal): ConversationStepped => ({
  ok: false,
  refusal,
})

/**
 * The state `events` leave, from the start, or the first refused event and
 * why: the first `lifted` under /1's rules (a record lifted from /1), every
 * later one under /2's.
 */
export function replayConversation(
  events: ReadonlyArray<ConversationEvent>,
  lifted = 0
):
  | { readonly ok: true; readonly state: ConversationState }
  | {
      readonly ok: false
      readonly at: number
      readonly refusal: ConversationRefusal
    } {
  let state = newConversation(lifted > 0 ? 1 : 2)
  for (const [i, event] of events.entries()) {
    const schema: ConversationSchemaVersion = i < lifted ? 1 : 2
    const stepped = stepConversation({ ...state, schema }, event)
    if (!stepped.ok) return { ok: false, at: i, refusal: stepped.refusal }
    state = stepped.state
  }
  // Whatever comes next is past every lifted event: /2's rules.
  return { ok: true, state: { ...state, schema: 2 } }
}

const whose = (voice: ConversationVoice): string =>
  voice === "owner" ? "the owner's" : "the agent's"

/** A refusal as a line for whoever wrote the event: the routine, or a test. */
export function refusalLine(refusal: ConversationRefusal): string {
  switch (refusal.why) {
    case "out-of-phase": {
      return `a ${refusal.event} event can't come while the conversation is ${refusal.phase}`
    }
    case "stale": {
      return `an event written against ${String(refusal.basis)} events can't follow the ${String(refusal.seq)} the log holds; read it again`
    }
    case "take-twice": {
      return `take ${refusal.take} is played twice over the same stretch in the version`
    }
    case "turn-voice": {
      return `turn ${refusal.turn} was ${whose(refusal.voice)} in an earlier version; a turn keeps its voice`
    }
    case "change-unnamed": {
      return `turn ${refusal.turn} changed, and no answer names it`
    }
    case "kept-changed": {
      return `flag ${refusal.flag} is kept, but what it covers changed`
    }
    case "too-many-points": {
      return `a conversation takes at most ${CONVERSATION_POLICY.pointsMost} points`
    }
    case "point-again": {
      return `take ${refusal.take} is already a point`
    }
    case "version-number": {
      return `the next version is ${refusal.expected}, not ${refusal.got}`
    }
    case "speaker-twice": {
      return `speaker ${refusal.speaker} is in the version twice`
    }
    case "cast-twice": {
      return `${refusal.character} speaks as two speakers${refusal.role === undefined ? "" : ` as ${refusal.role}`}; each cast member in a role is one speaker`
    }
    case "role-unknown": {
      return `speaker ${refusal.speaker} plays ${refusal.role}, which isn't one of its character's roles`
    }
    case "speaker-unknown": {
      return `turn ${refusal.turn} is spoken by ${refusal.speaker}, who isn't one of the version's speakers`
    }
    case "speaker-voice": {
      return `turn ${refusal.turn} isn't in ${refusal.speaker}'s voice`
    }
    case "turn-twice": {
      return `turn ${refusal.turn} is in the version twice`
    }
    case "take-unknown": {
      return `turn ${refusal.turn} plays take ${refusal.take}, which isn't one of the owner's points`
    }
    case "unused-unknown": {
      return `the version leaves out part of take ${refusal.take}, which isn't one of the owner's points`
    }
    case "outro-misplaced": {
      return "the outro is the version's last two turns: the agent's question, then the owner's own answer, unscripted"
    }
    case "unanswered": {
      return `the version doesn't answer flag ${refusal.flag}`
    }
    case "answer-unknown": {
      return `flag ${refusal.flag} isn't open on the version before`
    }
    case "answer-kinds": {
      return `flag ${refusal.flag} isn't of kind ${refusal.kind}, which its answer names`
    }
    case "answer-twice": {
      return `flag ${refusal.flag} is answered twice`
    }
    case "answer-kind": {
      return `a ${refusal.kind} flag can't be answered by ${refusal.how}; it takes ${ANSWERS_OF[refusal.kind].join(", ")}`
    }
    case "answer-scope": {
      return `flag ${refusal.flag} doesn't cover what ${refusal.how} changes: a retake is one turn's, a recast a speaker's`
    }
    case "rewrote-unchanged": {
      return `flag ${refusal.flag}'s answer names turn ${refusal.turn}, which didn't change`
    }
    case "unasked-unchanged": {
      return `an unasked change names turn ${refusal.turn}, which didn't change`
    }
    case "retook-unplaced": {
      return `flag ${refusal.flag}'s new take isn't played in its turn, or isn't new`
    }
    case "conditioned-unplaced": {
      return `flag ${refusal.flag}'s turns don't play the same stretch of the owner's takes in this version`
    }
    case "corrected-unplaced": {
      return `flag ${refusal.flag}'s turn doesn't play the same stretch of the owner's take in this version`
    }
    case "recast-unchanged": {
      return `flag ${refusal.flag}'s speaker is said in the same voice as before`
    }
    case "flag-again": {
      return `flag ${refusal.flag} is already raised`
    }
    case "turn-unknown": {
      return `flag ${refusal.flag} names turn ${refusal.turn}, which isn't in the newest version`
    }
    case "flag-speaker-unknown": {
      return `flag ${refusal.flag} names speaker ${refusal.speaker}, who isn't in the newest version`
    }
    case "flag-scope": {
      return `a ${refusal.kind} flag can't be raised on a whole ${refusal.scope}; it goes on ${FLAG_SCOPES[refusal.kind].join(" or ")}`
    }
    case "flag-voice": {
      return `a ${refusal.kind} flag is raised on ${whose(FLAG_VOICE[refusal.kind])} turns, and flag ${refusal.flag} covers none`
    }
    case "flag-not-open": {
      return `flag ${refusal.flag} isn't open`
    }
    case "heard-version": {
      return `only the newest version, ${refusal.expected}, can be measured, not ${refusal.got}`
    }
    case "heard-again": {
      return `version ${refusal.version}'s audio is already measured`
    }
    case "unheard": {
      return `version ${refusal.version} can't be green-lit before home has measured its audio`
    }
    case "too-long": {
      return `the version runs ${Math.ceil(refusal.ms / 60_000)} minutes, and a conversation runs at most ${CONVERSATION_POLICY.mostMs / 60_000}`
    }
    case "green-light-version": {
      return `only the newest version, ${refusal.expected}, can be green-lit, not ${refusal.got}`
    }
    case "notes-turn": {
      return `notes name turn ${refusal.turn}, which isn't in the newest version`
    }
    case "notes-word": {
      return `turn ${refusal.turn} has no word ${refusal.at}, or the notes name it twice`
    }
    case "notes-emotion": {
      return `turn ${refusal.turn}'s speaker has no ${refusal.emotion} emotion`
    }
    case "author": {
      return `a ${refusal.event} event is written by ${EVENT_AUTHORS[refusal.event].join(" or ")}, not the ${refusal.by}`
    }
    case "flag-version": {
      return `flag ${refusal.flag} was raised on version ${String(refusal.got)}, and the newest is ${String(refusal.expected)}`
    }
    case "moves-unknown": {
      return `no standing approval of preview ${refusal.preview} to move`
    }
    case "rule-again": {
      return `rule ${refusal.rule} is already set; a new approval of it names the one it moves`
    }
    case "notes-rule": {
      return `the notes follow rule ${refusal.rule}, which no approval of the owner's set`
    }
    case "preview-variant": {
      return `preview ${refusal.preview} offered no variant ${refusal.variant}`
    }
    case "preview-again": {
      return `preview ${refusal.preview} is already approved; a new pick on it names it as the one it moves`
    }
    case "offer-again": {
      return `preview ${refusal.preview} was offered already; a new preview has a new id`
    }
    case "preview-unknown": {
      return `no preview ${refusal.preview} was offered`
    }
    default: {
      return assertNever(refusal)
    }
  }
}

// The record as /1 kept it, frozen: read, then lifted into /2's events.
// Every schema below is a copy of what /1 read with, so a later change to
// the spoken card's turns or to the shared names never changes what /1 was.

const V1_FLAG_KINDS = [
  "too-quiet",
  "too-fast",
  "too-slow",
  "say-again",
  "not-salient",
  "assumes-context",
  "unhuman",
  "off-taste",
  "misses-point",
] as const satisfies ReadonlyArray<FlagKind>

/** The cast /1 knew, frozen: a later cast member is no /1 speaker. */
const V1_CHARACTERS = [
  "mochi",
  "tin-owlet",
  "tin-sparrow",
] as const satisfies ReadonlyArray<(typeof CHARACTERS)[number]>

const V1Words = z.string().trim().min(1)
const V1NoteSchema = V1Words.max(600)
const V1IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const V1TakeSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/,
    "it isn't a take's id, as home keeps it"
  )
const V1SayableSchema = z
  .string()
  .trim()
  .min(1, "it says nothing")
  .max(4_000, "home's speaker says at most 4000 characters in one line")
  .refine((text) => /[\p{L}\p{N}]/u.test(text), {
    message: "it has no letter or digit, so the speaker has nothing to say",
  })

const V1VersionSchema = z.strictObject({
  n: z.number().int().min(1),
  speakers: z
    .array(
      z.strictObject({
        id: V1IdSchema,
        character: z.enum(V1_CHARACTERS),
        voice: z.enum(["kokoro", "owner"]),
      })
    )
    .min(1)
    .max(8),
  turns: z
    .array(
      z.discriminatedUnion("voice", [
        z.strictObject({
          voice: z.literal("kokoro"),
          said: V1SayableSchema,
          id: V1IdSchema,
          speaker: V1IdSchema,
        }),
        z.strictObject({
          voice: z.literal("owner"),
          take: V1TakeSchema,
          id: V1IdSchema,
          speaker: V1IdSchema,
        }),
      ])
    )
    .min(1)
    .max(40),
  answers: z.array(
    z.discriminatedUnion("how", [
      z.strictObject({
        flag: V1IdSchema,
        how: z.literal("rewrote"),
        turns: z.array(V1IdSchema).min(1).max(80),
        note: V1NoteSchema.optional(),
      }),
      z.strictObject({
        flag: V1IdSchema,
        how: z.literal("retook"),
        take: V1TakeSchema,
      }),
      z.strictObject({
        flag: V1IdSchema,
        how: z.literal("conditioned"),
        note: V1NoteSchema.optional(),
      }),
      z.strictObject({
        flag: V1IdSchema,
        how: z.literal("kept"),
        note: V1NoteSchema,
      }),
    ])
  ),
})

const V1At = z.iso.datetime()

const V1EventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("topic"),
    at: V1At,
    topic: z.strictObject({
      said: V1NoteSchema,
      chat: z.url().optional(),
    }),
  }),
  z.strictObject({ event: z.literal("point"), at: V1At, take: V1TakeSchema }),
  z.strictObject({
    event: z.literal("version"),
    at: V1At,
    version: V1VersionSchema,
  }),
  z.strictObject({
    event: z.literal("flag"),
    at: V1At,
    flag: z.strictObject({
      id: V1IdSchema,
      turn: V1IdSchema,
      kind: z.enum(V1_FLAG_KINDS),
      note: V1NoteSchema.optional(),
    }),
  }),
  z.strictObject({ event: z.literal("withdraw"), at: V1At, flag: V1IdSchema }),
  z.strictObject({
    event: z.literal("green-light"),
    at: V1At,
    version: z.number().int().min(1),
  }),
])

/** A record as `some-ui.conversation/1` kept it. */
export const ConversationRecordV1Schema = z.strictObject({
  schema: z.literal(CONVERSATION_RECORD_SCHEMA_V1),
  id: V1IdSchema,
  events: z.array(V1EventSchema),
})

export type ConversationRecordV1 = z.infer<typeof ConversationRecordV1Schema>

type V1Event = ConversationRecordV1["events"][number]

/**
 * /1's events as /2 says them, in order: each speaker's voice as its kind
 * (the voice policy chose Kokoro's), each flag on its one turn, of its one
 * kind, on the version it followed, and each event's author, which /1 left
 * unsaid and its kind fixes (`EVENT_AUTHORS`). Everything else /1 held is
 * already /2's.
 */
export function liftV1(
  events: ReadonlyArray<V1Event>
): ReadonlyArray<ConversationEvent> {
  let latest = 0
  return events.map((event): ConversationEvent => {
    switch (event.event) {
      case "version": {
        latest = event.version.n
        return {
          ...event,
          by: "agent",
          version: {
            ...event.version,
            speakers: event.version.speakers.map((s) => ({
              ...s,
              voice: { kind: s.voice },
            })),
          },
        }
      }
      case "flag": {
        const { turn, kind, ...flag } = event.flag
        return {
          ...event,
          by: "owner",
          version: latest,
          flag: { ...flag, on: { scope: "turn", turn }, kinds: [kind] },
        }
      }
      case "topic":
      case "point":
      case "withdraw":
      case "green-light": {
        return { ...event, by: "owner" }
      }
      default: {
        return assertNever(event)
      }
    }
  })
}

/**
 * The /1 event `event` was lifted from, or null for one no lift makes: a
 * named voice, a flag beyond one turn and one of /1's kinds, any field /1
 * never had. Read back through /1's own schema, so it holds what /1 held.
 */
export function lowerToV1(event: ConversationEvent): V1Event | null {
  const lowered = ((): unknown => {
    const { by: _by, basis, ...rest } = event
    if (basis !== undefined) return null
    switch (rest.event) {
      case "version": {
        const speakers = rest.version.speakers.map((s) => {
          const { voice, ...speaker } = s
          return voice.kind === "kokoro" && voice.id !== undefined
            ? null
            : { ...speaker, voice: voice.kind }
        })
        return speakers.includes(null)
          ? null
          : { ...rest, version: { ...rest.version, speakers } }
      }
      case "flag": {
        const { version: _version, flag, ...flagEvent } = rest
        const { on, kinds, ...kept } = flag
        const [kind, ...more] = kinds
        return on.scope !== "turn" || more.length > 0
          ? null
          : { ...flagEvent, flag: { ...kept, turn: on.turn, kind } }
      }
      case "topic":
      case "point":
      case "withdraw":
      case "green-light":
      case "heard":
      case "notes":
      case "offer":
      case "approve": {
        // /1's own schema refuses the kinds it never had.
        return rest
      }
      default: {
        return assertNever(rest)
      }
    }
  })()
  const parsed = V1EventSchema.safeParse(lowered)
  return parsed.success ? parsed.data : null
}

/**
 * A kept record, read by its own schema's version and replayed: its state,
 * or every reason it can't be read. A /1 record is lifted (`liftV1`) and
 * marked so; a lifted record replays its lifted events under /1's rules and
 * every later one under /2's, and is refused where an event it claims was
 * lifted is one no lift makes.
 */
export function parseConversationRecord(raw: unknown): Parsed<{
  readonly record: ConversationRecord
  readonly state: ConversationState
}> {
  const schema =
    raw !== null && typeof raw === "object" && "schema" in raw
      ? raw.schema
      : undefined
  const read: Parsed<ConversationRecord> = (() => {
    if (schema === CONVERSATION_RECORD_SCHEMA_V1) {
      const v1 = ConversationRecordV1Schema.safeParse(raw)
      return v1.success
        ? {
            ok: true,
            value: {
              schema: CONVERSATION_RECORD_SCHEMA,
              id: v1.data.id,
              lifted: {
                from: CONVERSATION_RECORD_SCHEMA_V1,
                through: v1.data.events.length,
              },
              events: [...liftV1(v1.data.events)],
            },
          }
        : { ok: false, problems: problemsOf(v1.error, "conversation") }
    }
    const v2 = ConversationRecordSchema.safeParse(raw)
    return v2.success
      ? { ok: true, value: v2.data }
      : { ok: false, problems: problemsOf(v2.error, "conversation") }
  })()
  if (!read.ok) return read
  const record = read.value
  const through = record.lifted?.through ?? 0
  if (through > record.events.length)
    return {
      ok: false,
      problems: [
        `lifted: it claims ${String(through)} events were lifted, and it holds ${String(record.events.length)}`,
      ],
    }
  const unlifted = record.events
    .slice(0, through)
    .findIndex((event) => lowerToV1(event) === null)
  if (unlifted >= 0)
    return {
      ok: false,
      problems: [
        `events.${String(unlifted)}: it is marked lifted from /1, and /1 never kept it`,
      ],
    }
  const replayed = replayConversation(record.events, through)
  return replayed.ok
    ? { ok: true, value: { record, state: replayed.state } }
    : {
        ok: false,
        problems: [
          `events.${String(replayed.at)}: ${refusalLine(replayed.refusal)}`,
        ],
      }
}
