import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

/**
 * A session file (canon v1.2, Def. 1.9, Rem. 11.7): one phone session as a
 * graph of screens, written by an agent to Drive and pulled by the phone.
 * The format is the LeetType A/B's prototype format, kept so that the A/B's
 * harness can play real content too, plus optional fields the A/B's designs
 * could not express: `rule`, `cites`, `returnOf`, `returnFor`, `glosses`,
 * `panel`, `provenance`, `applies` and the session's `glossary`. Parsing checks
 * shape and wiring; `lib/leetype/session-file` lints the content.
 */

const ScreenIdSchema = z.string().min(1)

/** κ, the register entry an incident round is decided by (Def. 1.9, Rem. 7.4). */
const RuleIdSchema = z.string().regex(/^[MA][1-9]\d*$/, {
  message:
    "an incident round's rule is a Machine or Agreement id, M<n> or A<n>",
})

const SourceSchema = z.strictObject({
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.number().int(),
  where: z.string().min(1),
  url: z.url(),
  minutes: z.number().positive(),
})

/** An action with no `next` leaves the session from that screen. */
const ActionSchema = z.strictObject({
  label: z.string().min(1),
  next: ScreenIdSchema.nullish(),
  effect: z.enum(["read", "save"]).optional(),
})

/** `applies` names the register entry whose fix the option applies (Rem. 10.4). */
const OptionSchema = z.strictObject({
  label: z.string().min(1),
  next: ScreenIdSchema,
  applies: RuleIdSchema.optional(),
  correct: z.boolean().optional(),
  abstain: z.boolean().optional(),
  feedback: z.string().optional(),
})

/** Who holds what, for a round where the state matters (the "who holds what" panel). */
const PanelSchema = z.strictObject({
  title: z.string().min(1).optional(),
  rows: z
    .array(z.strictObject({ who: z.string().min(1), holds: z.string().min(1) }))
    .min(1),
})

/** Fields any screen may carry. `glosses` names glossary terms defined on it (Prop. 9.5). */
const screenBase = {
  title: z.string().optional(),
  pinned: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  glosses: z.array(z.string().min(1)).optional(),
}

const InfoScreenSchema = z.strictObject({
  ...screenBase,
  type: z.literal("info"),
  actions: z.array(ActionSchema),
})

/**
 * The response on a round a return follows (Prop. 9.1, Rem. 11.9): an
 * incorrect pick, slow or not; the abstention; or a correct pick slow enough
 * to be a struggle (Def. 9.4: slowness only annotates a pick). In the session
 * log's `AnswerSchema` these are `incorrect`, `abstained` and a `correct`
 * answer with `slow: true`.
 */
const ResponseKindSchema = z.enum(["incorrect", "abstain", "hesitate"])

export type ResponseKind = z.infer<typeof ResponseKindSchema>

/**
 * A choice. With a correct option it is a round (Def. 1.9): `rule` is ρ,
 * `cites` the reading screen whose passage answers it (π), `returnOf` the
 * round it returns (Prop. 9.4 (b)) and `returnFor` which of that round's
 * responses it follows (Rem. 11.9). `onHesitate` is where a slow pick goes
 * instead of the option's own `next` (Def. 9.4).
 */
const ChoiceScreenSchema = z.strictObject({
  ...screenBase,
  type: z.literal("choice"),
  // At most five, the abstention included (Def. 1.9).
  options: z.array(OptionSchema).min(2).max(5),
  onHesitate: ScreenIdSchema.optional(),
  rule: RuleIdSchema.optional(),
  cites: ScreenIdSchema.optional(),
  returnOf: ScreenIdSchema.optional(),
  returnFor: ResponseKindSchema.optional(),
  panel: PanelSchema.optional(),
  provenance: z.string().min(1).optional(),
})

/** A spoken answer: the rubric is shown only after recording (Ax. 9.2). */
const RecordScreenSchema = z.strictObject({
  ...screenBase,
  type: z.literal("record"),
  prompt: z.string().min(1),
  maxSeconds: z.number().int().positive(),
  rubric: z.array(z.string().min(1)).min(1),
  weakIfFewerThan: z.number().int().nonnegative(),
  next: ScreenIdSchema,
  onWeak: ScreenIdSchema.optional(),
})

/** A reading: placed after a struggle, offered as a pointer, or scheduled. */
const ReadingScreenSchema = z.strictObject({
  ...screenBase,
  type: z.literal("reading"),
  primer: z.string().min(1),
  source: SourceSchema,
  passage: z.string().optional(),
  actions: z.array(ActionSchema),
})

/** The last screen. */
const EndScreenSchema = z.strictObject({
  ...screenBase,
  type: z.literal("end"),
  actions: z.array(ActionSchema).optional(),
})

const ScreenSchema = z.discriminatedUnion("type", [
  InfoScreenSchema,
  ChoiceScreenSchema,
  RecordScreenSchema,
  ReadingScreenSchema,
  EndScreenSchema,
])

export type SessionScreen = z.infer<typeof ScreenSchema>
export type ChoiceScreen = z.infer<typeof ChoiceScreenSchema>

/** Every screen id a screen can lead to, in authored order. */
export function edgesOf(screen: SessionScreen): Array<string> {
  switch (screen.type) {
    case "choice": {
      return [
        ...screen.options.map((option) => option.next),
        ...(screen.onHesitate ? [screen.onHesitate] : []),
      ]
    }
    case "record": {
      return [screen.next, ...(screen.onWeak ? [screen.onWeak] : [])]
    }
    case "info":
    case "reading":
    case "end": {
      return (screen.actions ?? []).flatMap((action) =>
        action.next ? [action.next] : []
      )
    }
    default: {
      return assertNever(screen)
    }
  }
}

export const SessionFileSchema = z
  .strictObject({
    variant: z.string().optional(),
    title: z.string().min(1),
    oneLine: z.string().min(1),
    session: z.strictObject({
      kind: z.string().min(1),
      budgetMinutes: z.number().positive(),
    }),
    /** Term → its one-line gloss, for the terms the session relies on (Prop. 9.5). */
    glossary: z.record(z.string().min(1), z.string().min(1)).optional(),
    start: ScreenIdSchema,
    screens: z.record(ScreenIdSchema, ScreenSchema),
  })
  .superRefine((file, ctx) => {
    const screens = file.screens
    const exists = (id: string): boolean => Object.hasOwn(screens, id)
    if (!exists(file.start)) {
      ctx.addIssue({
        code: "custom",
        path: ["start"],
        message: `start "${file.start}" is not a screen`,
      })
    }
    for (const [id, screen] of Object.entries(screens)) {
      for (const next of edgesOf(screen)) {
        if (!exists(next)) {
          ctx.addIssue({
            code: "custom",
            path: ["screens", id],
            message: `leads to "${next}", which is not a screen`,
          })
        }
      }
      for (const term of screen.glosses ?? []) {
        if (!file.glossary || !Object.hasOwn(file.glossary, term)) {
          ctx.addIssue({
            code: "custom",
            path: ["screens", id, "glosses"],
            message: `glosses "${term}", which is not in the glossary`,
          })
        }
      }
      if (screen.type === "choice") {
        const correct = screen.options.filter((option) => option.correct)
        if (correct.length > 1) {
          ctx.addIssue({
            code: "custom",
            path: ["screens", id, "options"],
            message: "a choice has at most one correct option",
          })
        }
        if (screen.options.some((o) => o.abstain && o.correct)) {
          ctx.addIssue({
            code: "custom",
            path: ["screens", id, "options"],
            message: "an abstention is never the correct option (Prop. 9.1)",
          })
        }
        if (screen.returnFor !== undefined && screen.returnOf === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["screens", id, "returnFor"],
            message:
              "returnFor names the response a return follows; it needs returnOf",
          })
        }
        const typed: Array<[string | undefined, SessionScreen["type"]]> = [
          [screen.cites, "reading"],
          [screen.returnOf, "choice"],
        ]
        for (const [target, type] of typed) {
          if (target !== undefined && screens[target]?.type !== type) {
            ctx.addIssue({
              code: "custom",
              path: ["screens", id],
              message: `"${target}" is not a ${type} screen`,
            })
          }
        }
      }
      if (
        screen.type === "record" &&
        screen.weakIfFewerThan > screen.rubric.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["screens", id, "weakIfFewerThan"],
          message: "weakIfFewerThan exceeds the rubric's length",
        })
      }
    }
  })

export type SessionFile = z.infer<typeof SessionFileSchema>
