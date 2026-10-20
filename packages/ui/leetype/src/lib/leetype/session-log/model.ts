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
  /** The worked confirmation of a parked round, taken (Prop. 9.4 (d)). */
  z.strictObject({
    ...Stamp,
    ...OnScreen,
    type: z.literal("confirmation-taken"),
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

export function append(log: SessionLog, event: SessionEvent): SessionLog {
  return log.some((kept) => kept.id === event.id) ? log : [...log, event]
}

type OnFile = z.infer<z.ZodObject<typeof OnScreen>>

/**
 * What a session's ledger screen says (Prop. 10.2), computed from the log
 * up to the session's last event, so a past session's ledger never changes.
 * `parked` and `saved` are across every session until then: a round parked
 * earlier and not since returned and solved, or a take not since answered
 * strongly, still waits on its reading, and a reading saved earlier and not
 * since read is still saved.
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
      event.answer.response === "correct" &&
      // A slow correct return is still a struggle (Def. 9.4): it stays parked.
      !event.answer.slow
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

type Response = z.infer<typeof AnswerSchema>["response"]

/**
 * One round's funnel in one session (Prop. 9.4): the first pick, the
 * reading placed after a struggle and what was done with it, the return
 * played, and whether the round ended solved, a correct and unhurried pick
 * or return.
 */
type RoundSummary = OnFile & {
  readonly picked: Response
  readonly struggled: boolean
  readonly placed: string | null
  readonly reading: ReadonlyArray<"opened" | "saved" | "read" | "skipped">
  readonly returned: Response | null
  readonly solved: boolean
}

/**
 * How one session went, derived from its events and carrying none of them,
 * for a reader outside the phone's record (`apps/www`'s study-context
 * export, some-ui #1923): the record itself stays in the log.
 */
export type SessionSummary = {
  readonly session: string
  readonly file: string
  readonly form: "full" | "short"
  readonly startedAt: string
  readonly ended: "declared" | "left" | null
  readonly rounds: ReadonlyArray<RoundSummary>
  readonly spoken: ReadonlyArray<
    OnFile & {
      readonly as: "passed" | "recorded" | "typed"
      readonly strong: boolean
    }
  >
}

const unhurried = (answer: z.infer<typeof AnswerSchema>): boolean =>
  answer.response === "correct" && !answer.slow

/** Every started session's summary, in the order the log holds them. */
export function summariesOf(log: SessionLog): Array<SessionSummary> {
  const summaries: Array<SessionSummary> = []
  for (const start of log) {
    if (start.type !== "started") continue
    const events = log.filter((event) => event.session === start.session)
    const rounds = new Map<string, RoundSummary>()
    const placedFor = new Map<string, string>()
    const actions = new Map<string, Array<RoundSummary["reading"][number]>>()
    const spoken: Array<SessionSummary["spoken"][number]> = []
    let ended: SessionSummary["ended"] = null
    for (const event of events) {
      switch (event.type) {
        case "picked": {
          const key = keyOf(event.file, event.screen)
          if (rounds.has(key)) break
          const struggled = !unhurried(event.answer)
          rounds.set(key, {
            file: event.file,
            screen: event.screen,
            picked: event.answer.response,
            struggled,
            placed: null,
            reading: [],
            returned: null,
            solved: !struggled,
          })
          break
        }
        case "placed": {
          if (event.as === "placement") {
            placedFor.set(keyOf(event.file, event.screen), event.reading)
          }
          break
        }
        case "reading": {
          const key = keyOf(event.file, event.reading)
          actions.set(key, [...(actions.get(key) ?? []), event.action])
          break
        }
        case "returned": {
          const key = keyOf(event.file, event.screen)
          const round = rounds.get(key)
          if (round === undefined) break
          rounds.set(key, {
            ...round,
            returned: event.answer.response,
            solved: round.solved || unhurried(event.answer),
          })
          break
        }
        case "spoken": {
          const { file, screen, answer } = event
          spoken.push({
            file,
            screen,
            as: answer.as,
            strong: answer.as !== "passed" && answer.strong,
          })
          break
        }
        case "ended": {
          ended = event.how
          break
        }
        case "started":
        case "parked":
        case "confirmation-taken": {
          break
        }
        default: {
          assertNever(event)
        }
      }
    }
    summaries.push({
      session: start.session,
      file: start.file,
      form: start.form,
      startedAt: start.at,
      ended,
      rounds: [...rounds].map(([key, round]) => {
        const placed = placedFor.get(key) ?? null
        return {
          ...round,
          placed,
          reading:
            placed === null
              ? []
              : (actions.get(keyOf(round.file, placed)) ?? []),
        }
      }),
      spoken,
    })
  }
  return summaries
}
