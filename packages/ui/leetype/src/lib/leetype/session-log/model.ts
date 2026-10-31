import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

/**
 * The session log (canon v1.2, Prop. 9.4, Prop. 10.2, Rem. 11.7): every
 * phone session of incident rounds, as an append-only list of what
 * happened. It is the owner's record ("Never lose the record", CLAUDE.md):
 * `append` only adds, and a later event says what changed (a round parked,
 * then returned and solved, is solved). Nothing here removes or rewrites an
 * event, and the ledger screen and every report are computed from it.
 *
 * Screen ids are a session file's own (`types/session-file.ts`), so every
 * event that names a screen also names its `file`: a return, a reading or a
 * pointer may come from another file than the one the session started.
 */

/** One run of one session file; no `:`, since it names a storage key (`stored.ts`). */
export const SessionIdSchema = z.string().regex(/^[^:]+$/)

const Stamp = {
  /** Unique; an event whose id its session already keeps is not appended twice. */
  id: z.string().min(1),
  at: z.iso.datetime(),
  session: SessionIdSchema,
}

const OnScreen = { file: z.string().min(1), screen: z.string().min(1) }

/**
 * Prop. 9.1's three responses, kept as three (Def. 9.4). Slowness, slower
 * than twice the learner's median for that kind of round when the pick was
 * made, annotates a correct or an incorrect pick and never the abstention.
 */
const AnswerSchema = z.discriminatedUnion("response", [
  z.strictObject({ response: z.literal("abstained") }),
  z.strictObject({ response: z.literal("correct"), slow: z.boolean() }),
  z.strictObject({ response: z.literal("incorrect"), slow: z.boolean() }),
])

const Pick = {
  /** The option's label. */
  option: z.string(),
  ms: z.number().nonnegative(),
  answer: AnswerSchema,
}

export const SessionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...Stamp,
    type: z.literal("started"),
    file: z.string().min(1),
    form: z.enum(["full", "short"]),
    declaredMinutes: z.number().positive(),
  }),
  z.strictObject({ ...Stamp, ...OnScreen, ...Pick, type: z.literal("picked") }),
  /**
   * A reading offered for a round: placed after a struggle, or a pointer
   * after a solved round (Prop. 9.4 (a), (c)). `reading` is in `file` too.
   */
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("placed"),
    reading: z.string().min(1),
    as: z.enum(["placement", "pointer"]),
  }),
  z.strictObject({
    ...Stamp,
    file: z.string().min(1),
    type: z.literal("reading"),
    reading: z.string().min(1),
    action: z.enum(["opened", "saved", "read", "skipped"]),
  }),
  z.strictObject({ ...Stamp, ...OnScreen, type: z.literal("parked") }),
  /**
   * The worked confirmation of a struggled or parked round, taken
   * (Prop. 9.4 (d)): it shows the round's answer, so a return after it is
   * assisted, as after `rubric-shown` (Rem. 9.5, Rem. 11.10).
   */
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("confirmation-taken"),
  }),
  /**
   * A take's rubric shown that states the answer of `screen`, a round
   * (canon Rem. 11.10): a return of it after this, until the round's next
   * struggle, is assisted (Rem. 9.5). `take` is the record screen.
   */
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("rubric-shown"),
    take: z.string().min(1),
  }),
  /**
   * A return played: `screen` is the parked round, `variant` the return.
   * `asked` when the learner requested it rather than the sampler offering
   * it (Prop. 9.4 (d), Rem. 9.5).
   */
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    ...Pick,
    type: z.literal("returned"),
    variant: z.string().min(1),
    asked: z.boolean(),
  }),
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("spoken"),
    /**
     * Passed, or answered aloud or typed (a bus) with the rubric points
     * ticked after; `strong` when the ticks reach what the screen asks.
     */
    answer: z.discriminatedUnion("as", [
      z.strictObject({ as: z.literal("passed") }),
      z.strictObject({
        as: z.literal("recorded"),
        seconds: z.number().positive(),
        ticks: z.array(z.string()),
        strong: z.boolean(),
      }),
      z.strictObject({
        as: z.literal("typed"),
        ticks: z.array(z.string()),
        strong: z.boolean(),
      }),
    ]),
  }),
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("ended"),
    how: z.enum(["declared", "left"]),
  }),
])

export type SessionEvent = z.infer<typeof SessionEventSchema>
export type SessionLog = ReadonlyArray<SessionEvent>

/** `log` in the order its events happened: the store lays it out session by session. */
export const byTime = (log: SessionLog): Array<SessionEvent> =>
  [...log].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

export function append(log: SessionLog, event: SessionEvent): SessionLog {
  return log.some((kept) => kept.id === event.id) ? log : [...log, event]
}

type OnFile = z.infer<z.ZodObject<typeof OnScreen>>

/**
 * What a session's ledger screen says (Prop. 10.2), computed from the log
 * up to the session's last event, so a past session's ledger never changes.
 * `parked` and `saved` are across every session until then: a round parked
 * earlier and not since returned correctly and unhurried, or a take not
 * since answered strongly, still waits on its reading, and a reading saved
 * earlier and not since read is still saved. An assisted return unparks its
 * round here too, so the learner is not kept on a round they answer, though
 * `summariesOf` counts it assisted, not solved (canon Rem. 11.10).
 */
export type SessionLedger = {
  readonly walked: ReadonlyArray<OnFile>
  readonly parked: ReadonlyArray<OnFile & { readonly reading: string | null }>
  readonly saved: ReadonlyArray<{
    readonly file: string
    readonly reading: string
  }>
  readonly spoken: ReadonlyArray<
    OnFile & { readonly as: "passed" | "recorded" | "typed" }
  >
}

const keyOf = (file: string, screen: string): string =>
  JSON.stringify([file, screen])

type Answer = z.infer<typeof AnswerSchema>

/** A correct pick in time; anything else is a struggle (Def. 9.4). */
const unhurried = (answer: Answer): boolean =>
  answer.response === "correct" && !answer.slow

/**
 * Which rounds had their answer shown since their last struggle, by a
 * take's rubric (`rubric-shown`) or their worked confirmation
 * (`confirmation-taken`) (Rem. 9.5, Rem. 11.10, promise LTY1): fed every
 * event in order, it answers for a return whether it is assisted. A
 * struggled pick of the round, first or replayed, starts it afresh; it
 * comes before the reveal's confirmation and the park.
 */
class Assistance {
  private readonly shown = new Set<string>()

  see(event: SessionEvent): void {
    if (event.type === "rubric-shown" || event.type === "confirmation-taken") {
      this.shown.add(keyOf(event.file, event.screen))
    } else if (event.type === "picked" && !unhurried(event.answer)) {
      this.shown.delete(keyOf(event.file, event.screen))
    }
  }

  has(event: OnFile): boolean {
    return this.shown.has(keyOf(event.file, event.screen))
  }
}

export function ledgerOf(log: SessionLog, session: string): SessionLedger {
  // By time, not position: the store lays the log out session by session.
  let until = -Infinity
  for (const event of log) {
    if (event.session === session) until = Math.max(until, Date.parse(event.at))
  }
  const before = log.filter((event) => Date.parse(event.at) <= until)
  const walked = new Map<string, OnFile>()
  const spoken: Array<SessionLedger["spoken"][number]> = []
  for (const event of before) {
    if (event.session !== session) continue
    if (event.type === "picked" || event.type === "returned") {
      const screen = event.type === "picked" ? event.screen : event.variant
      walked.set(keyOf(event.file, screen), { file: event.file, screen })
    } else if (event.type === "spoken") {
      const { file, screen } = event
      spoken.push({ file, screen, as: event.answer.as })
    }
  }

  // The reading a parked round waits on is the last one placed for it.
  const placedFor = new Map<string, string>()
  const waiting = new Map<string, OnFile>()
  const saved = new Map<string, { file: string; reading: string }>()
  for (const event of before) {
    if (event.type === "placed" && event.as === "placement") {
      placedFor.set(keyOf(event.file, event.screen), event.reading)
    } else if (event.type === "parked") {
      waiting.set(keyOf(event.file, event.screen), {
        file: event.file,
        screen: event.screen,
      })
    } else if (
      event.type === "returned" &&
      // A slow correct return is still a struggle (Def. 9.4): it stays parked.
      unhurried(event.answer)
    ) {
      waiting.delete(keyOf(event.file, event.screen))
    } else if (
      event.type === "spoken" &&
      event.answer.as !== "passed" &&
      event.answer.strong
    ) {
      waiting.delete(keyOf(event.file, event.screen))
    } else if (event.type === "reading") {
      const key = keyOf(event.file, event.reading)
      if (event.action === "saved") {
        saved.set(key, { file: event.file, reading: event.reading })
      } else if (event.action === "read") {
        saved.delete(key)
      }
    }
  }

  return {
    walked: [...walked.values()],
    parked: [...waiting].map(([key, round]) => ({
      ...round,
      reading: placedFor.get(key) ?? null,
    })),
    saved: [...saved.values()],
    spoken,
  }
}

type Of<T extends SessionEvent["type"]> = Extract<SessionEvent, { type: T }>

/**
 * One round's funnel (Prop. 9.4): its first pick, the readings placed after
 * a struggle and what was done with each, the returns played, and whether
 * it is solved: a correct, unhurried pick, or such a return unassisted
 * (nothing showed its answer since its last struggle), since its last
 * struggle. `ledgerOf` counts parked rounds the same way, except that an
 * assisted return unparks there and a struggle left on its reveal (the app
 * closed before it parked) is unsolved here. Later sessions add to it: a
 * reading saved on the bus and read the next day, a return taken from the
 * first screen, a replay's struggle that parks it again. A reading opened
 * with no placement in view goes to the round its latest placement was
 * for.
 */
type RoundSummary = OnFile & {
  readonly picked: Answer["response"]
  readonly struggled: boolean
  readonly placed: ReadonlyArray<string>
  readonly reading: ReadonlyArray<{
    readonly reading: string
    readonly action: Of<"reading">["action"]
  }>
  /** Each return's answer; `assisted` when its answer was shown since its last struggle. */
  readonly returned: ReadonlyArray<Answer & { readonly assisted: boolean }>
  readonly solved: boolean
}

/**
 * How one session went, derived from the log and carrying none of its
 * events, for a reader outside the phone's record (`apps/www`'s
 * study-context export, some-ui #1923). `rounds` are the rounds first
 * picked in it, each with its whole funnel so far; `replays`, rounds picked
 * again after their first pick, whose own answers add nothing to it
 * (Rem. 9.5).
 */
export type SessionSummary = {
  readonly session: string
  readonly file: string
  readonly form: Of<"started">["form"]
  readonly startedAt: string
  readonly ended: Of<"ended">["how"] | null
  readonly rounds: ReadonlyArray<RoundSummary>
  readonly replays: ReadonlyArray<
    OnFile & { readonly picked: Answer["response"] }
  >
  readonly spoken: ReadonlyArray<
    OnFile & {
      readonly as: Of<"spoken">["answer"]["as"]
      readonly strong: boolean
    }
  >
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends ReadonlyArray<infer U>
    ? Array<U>
    : T[K]
}

/** Every started session's summary, in the order the sessions started. */
export function summariesOf(log: SessionLog): Array<SessionSummary> {
  const ordered = byTime(log)
  const sessions = new Map<string, Mutable<SessionSummary>>()
  const rounds = new Map<
    string,
    { session: string; round: Mutable<RoundSummary> }
  >()
  // The round the latest placement of each reading was for; null for a pointer.
  const placedFor = new Map<string, string | null>()
  const assisted = new Assistance()
  for (const event of ordered) {
    const summary = sessions.get(event.session)
    assisted.see(event)
    switch (event.type) {
      case "started": {
        sessions.set(event.session, {
          session: event.session,
          file: event.file,
          form: event.form,
          startedAt: event.at,
          ended: null,
          rounds: [],
          replays: [],
          spoken: [],
        })
        break
      }
      case "picked": {
        const key = keyOf(event.file, event.screen)
        const first = rounds.get(key)
        if (summary === undefined) break
        if (first === undefined) {
          const round: Mutable<RoundSummary> = {
            file: event.file,
            screen: event.screen,
            picked: event.answer.response,
            struggled: !unhurried(event.answer),
            placed: [],
            reading: [],
            returned: [],
            solved: unhurried(event.answer),
          }
          rounds.set(key, { session: event.session, round })
          summary.rounds.push(round)
        } else {
          summary.replays.push({
            file: event.file,
            screen: event.screen,
            picked: event.answer.response,
          })
        }
        break
      }
      case "placed": {
        const key = keyOf(event.file, event.screen)
        const placement = event.as === "placement"
        placedFor.set(keyOf(event.file, event.reading), placement ? key : null)
        if (placement) rounds.get(key)?.round.placed.push(event.reading)
        break
      }
      case "reading": {
        const owner = placedFor.get(keyOf(event.file, event.reading))
        if (owner === undefined || owner === null) break
        rounds.get(owner)?.round.reading.push({
          reading: event.reading,
          action: event.action,
        })
        break
      }
      case "returned": {
        const round = rounds.get(keyOf(event.file, event.screen))?.round
        if (round === undefined) break
        const helped = assisted.has(event)
        round.returned.push({ ...event.answer, assisted: helped })
        round.solved ||= unhurried(event.answer) && !helped
        break
      }
      case "spoken": {
        const { file, screen, answer } = event
        summary?.spoken.push({
          file,
          screen,
          as: answer.as,
          strong: answer.as !== "passed" && answer.strong,
        })
        break
      }
      case "ended": {
        if (summary !== undefined) summary.ended = event.how
        break
      }
      case "parked": {
        // Any park, a replay's included, unsolves it, as `ledgerOf` has it.
        const round = rounds.get(keyOf(event.file, event.screen))?.round
        if (round !== undefined) round.solved = false
        break
      }
      case "confirmation-taken":
      case "rubric-shown": {
        break
      }
      default: {
        assertNever(event)
      }
    }
  }
  return [...sessions.values()]
}
