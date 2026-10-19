import { z } from "zod"

import { ADJACENT_FAMILIES, MAX_SET_ASIDE, TRACKS } from "./policy"
import {
  CommitSchema,
  FingerprintSchema,
  HttpsUrlSchema,
  IdSchema,
  parseWith,
  text,
  TrackedSchema,
  type Parsed,
} from "./shared"

/**
 * `some-ui.job-digest/1`: what the daily routine leaves in Drive's
 * `some-ui jobs/Brief/` as `digest-<day>.json`. A day's picks, each scored
 * and carrying the résumé to send, plus what the run set aside and its
 * verdict on each scout it read. The phone opens it from the file picker.
 *
 * `sample.digest.json` (`sampleDigest()`) is a complete digest, and the template a run
 * copies.
 */

/**
 * The layouts the home render service accepts contact details for
 * (`packages/ui/resume/src/pii/envelope.json`): a résumé that is sent is
 * built with them.
 */
export const SUBMISSION_TEMPLATES = [
  "classic",
  "vanilla",
  "safe",
  "conventional",
] as const

/** The compositions a software pick sends. An adjacent pick sends its family's. */
export const SOFTWARE_VARIANTS = ["backend", "platform", "fullstack"] as const

/** `@some-ui/resume`'s compositions, the only ones a build can render. */
export const RESUME_VARIANTS = [
  ...SOFTWARE_VARIANTS,
  ...ADJACENT_FAMILIES,
] as const

const BuiltVariantSchema = z.enum(RESUME_VARIANTS)

/** A patch may name a composition that does not exist yet. */
const VariantSchema = z.string().regex(/^[a-z][a-z-]{1,30}$/)

const ResumeSchema = z.discriminatedUnion("kind", [
  z.object({
    /** An existing composition fits as it stands. */
    kind: z.literal("build"),
    variant: BuiltVariantSchema,
    template: z.enum(SUBMISSION_TEMPLATES),
    /** The some-ui commit whose composition the fits were read from. */
    ref: CommitSchema,
  }),
  z.object({
    /**
     * No composition leads with what the posting wants yet: a change to one,
     * or a new one, proposed as a PR.
     */
    kind: z.literal("patch"),
    variant: VariantSchema,
    template: z.enum(SUBMISSION_TEMPLATES),
    /** The existing composition to send until the patch is merged. */
    fallback: BuiltVariantSchema,
    /** The PR that adds it, or null while it is only proposed. */
    pr: z.number().int().positive().nullable(),
    /** What the composition would lead with, in a sentence or two. */
    change: text,
  }),
])

export type ResumeRecommendation = z.infer<typeof ResumeSchema>

const LabelledSchema = z.object({ label: text, value: text })

const ScoresSchema = z.object({
  /** How much of what the posting requires my evidence covers, 0 to 1. */
  fit: z.number().min(0).max(1),
  /** The chance of hearing back, 0 to 1. A judgment until outcomes calibrate it. */
  odds: z.number().min(0).max(1),
  fitWhy: text,
  oddsWhy: text,
})

const GapSchema = z.object({
  kind: z.enum(["unknown", "learnable", "hard"]),
  text,
})

/**
 * A free-text question on the posting's own application form (ROUTINE.md
 * §7), as the form words it, with the run's draft from the pick's fits.
 */
const QuestionSchema = z.object({
  label: text,
  required: z.boolean(),
  /** Null only for an optional question the run left to me. */
  draft: text.nullable(),
})

const KitSchema = z
  .object({
    /** Copied into the form one at a time: email, links, location. */
    fields: z.array(LabelledSchema),
    /** The form's standard questions, already answered. */
    answers: z.array(LabelledSchema),
    /** A draft, when the form takes a cover letter. Digests before it had none. */
    coverLetter: text.nullable().default(null),
    /** Every free-text question the form asks. Digests before it had none. */
    questions: z.array(QuestionSchema).default([]),
    /** What to answer when the form asks my pay expectation, and why. */
    compensation: z.object({ ask: text, why: text }).nullable().default(null),
    /** Digests before the form was read carried one free-text answer here. */
    why: z.object({ prompt: text, draft: text }).nullable().optional(),
  })
  .transform(({ why, ...kit }) =>
    why
      ? {
          ...kit,
          questions: [
            { label: why.prompt, required: false, draft: why.draft },
            ...kit.questions,
          ],
        }
      : kit
  )

export type Kit = z.infer<typeof KitSchema>

const PickSchema = z
  .object({
    id: IdSchema,
    fingerprint: FingerprintSchema,
    posting: z.object({
      title: text,
      company: text,
      location: text,
      compensation: text.nullable(),
      /** The experience the posting asks for, as it says it. */
      experience: text.nullable(),
      postedOn: z.iso.date().nullable(),
      applyUrl: HttpsUrlSchema,
    }),
    scores: ScoresSchema,
    /** What the posting asks for, in a sentence or two. */
    wants: text,
    fits: z.array(z.object({ title: text, detail: text, source: text })).min(1),
    gaps: z.array(GapSchema),
    dontClaim: z.array(text),
    resume: ResumeSchema,
    kit: KitSchema,
  })
  .and(TrackedSchema)

export type Pick = z.infer<typeof PickSchema>

export const DigestSchema = z.object({
  schema: z.literal("some-ui.job-digest/1"),
  /** The local day it is for: `digest-<day>.json`. */
  day: z.iso.date(),
  createdAt: z.iso.datetime(),
  /** Distinct postings the run read, before setting any aside. */
  seen: z.number().int().nonnegative(),
  picks: z.array(PickSchema),
  /** Postings the run read and did not pick, each with why. */
  setAside: z
    .array(
      z.object({
        fingerprint: FingerprintSchema,
        title: text,
        company: text,
        why: text,
      })
    )
    .max(MAX_SET_ASIDE),
  /** The run's answer to each scout it read. */
  scouts: z.array(
    z.object({
      scoutId: IdSchema,
      verdict: z.enum(["agree", "disagree", "not-found"]),
      note: text,
      /** The pick it became, when it became one. */
      pickId: IdSchema.nullable(),
      /**
       * The set-aside rule that decided it (ROUTINE.md §4), in a few words,
       * when one did. Digests before it had none.
       */
      rule: text.nullable().default(null),
      /**
       * How the run scored a scout it found that isn't a pick, and what to
       * send if I apply anyway. Null for a pick (the pick says it), a scout
       * not found, or one a set-aside rule decided. Digests before it had
       * none.
       */
      review: z
        .object({
          scores: ScoresSchema,
          gaps: z.array(GapSchema),
          sends: z.object({
            variant: BuiltVariantSchema,
            template: z.enum(SUBMISSION_TEMPLATES),
          }),
        })
        .nullable()
        .default(null),
    })
  ),
  /**
   * The picks from earlier digests still open when the run began
   * (`openPicks`), each holding a slot of its track's `MAX_OPEN_PICKS`
   * unless its posting has `closed`. Digests before the queue had none.
   */
  queue: z
    .object({
      open: z.array(
        z.object({
          day: z.iso.date(),
          pickId: IdSchema,
          track: z.enum(TRACKS),
          /** The posting is gone (§3's 404 rule), so its slot is free. */
          closed: z.boolean(),
        })
      ),
    })
    .nullable()
    .default(null),
  /** The Drive files this run read: decisions and scouts, by name. */
  read: z.array(text),
  /** The voice notes this run transcribed, by file name. */
  transcribed: z.array(text),
  /** The commits the fits were checked at. */
  evidence: z.object({ someUi: CommitSchema, server: CommitSchema }),
})

export type Digest = z.infer<typeof DigestSchema>

export function parseDigest(raw: string): Parsed<Digest> {
  return parseWith(DigestSchema, "a digest", raw)
}

export function digestFileName(day: string): string {
  return `digest-${day}.json`
}
