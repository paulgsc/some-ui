import { z } from "zod"

import {
  CommitSchema,
  FamilySchema,
  FingerprintSchema,
  IdSchema,
  parseWith,
  text,
  TrackSchema,
  type Parsed,
} from "./shared"

/**
 * `some-ui.job-digest/1`: what the daily routine leaves in Drive's
 * `some-ui jobs/Brief/` as `digest-<day>.json`. A day's picks, each scored
 * and carrying the résumé to send, plus what the run set aside and its
 * verdict on each scout it read. The phone opens it from the file picker.
 *
 * Widened from the unmerged branch's `some-ui.job-brief/1` (one posting at a
 * time): a pick keeps the brief's fits, gaps, dontClaim and kit, and adds a
 * track, two scores, a fingerprint, and a résumé that is a build or a patch.
 *
 * `__tests__/sample.digest.json` is a complete digest, and the template a run
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

/** A composition's name: one of `@some-ui/resume`'s variants, or a new one. */
const VariantSchema = z.string().regex(/^[a-z][a-z-]{1,30}$/)

const ResumeSchema = z.discriminatedUnion("kind", [
  z.object({
    /** An existing composition fits as it stands. */
    kind: z.literal("build"),
    variant: VariantSchema,
    template: z.enum(SUBMISSION_TEMPLATES),
    /** The some-ui commit whose composition the fits were read from. */
    ref: CommitSchema,
  }),
  z.object({
    /** The posting needs a composition that does not exist yet. */
    kind: z.literal("patch"),
    variant: VariantSchema,
    template: z.enum(SUBMISSION_TEMPLATES),
    /** The existing composition to send until the patch is merged. */
    fallback: VariantSchema,
    /** The PR that adds it, or null while it is only proposed. */
    pr: z.number().int().positive().nullable(),
    /** What the composition would lead with, in a sentence or two. */
    change: text,
  }),
])

export type ResumeRecommendation = z.infer<typeof ResumeSchema>

const LabelledSchema = z.object({ label: text, value: text })

const PickSchema = z.object({
  id: IdSchema,
  track: TrackSchema,
  /** The adjacent family, or null on the software track. */
  family: FamilySchema.nullable(),
  fingerprint: FingerprintSchema,
  posting: z.object({
    title: text,
    company: text,
    location: text,
    compensation: text.nullable(),
    /** The experience the posting asks for, as it says it. */
    experience: text.nullable(),
    postedOn: z.iso.date().nullable(),
    applyUrl: z.url({ protocol: /^https$/ }),
  }),
  scores: z.object({
    /** How much of what the posting requires my evidence covers, 0 to 1. */
    fit: z.number().min(0).max(1),
    /** The chance of hearing back, 0 to 1. A judgment until outcomes calibrate it. */
    odds: z.number().min(0).max(1),
    fitWhy: text,
    oddsWhy: text,
  }),
  /** What the posting asks for, in a sentence or two. */
  wants: text,
  fits: z.array(z.object({ title: text, detail: text, source: text })).min(1),
  gaps: z.array(
    z.object({ kind: z.enum(["unknown", "learnable", "hard"]), text })
  ),
  dontClaim: z.array(text),
  resume: ResumeSchema,
  kit: z.object({
    /** Copied into the form one at a time: email, links, location. */
    fields: z.array(LabelledSchema),
    /** The form's standard questions, already answered. */
    answers: z.array(LabelledSchema),
    why: z.object({ prompt: text, draft: text }).nullable(),
  }),
})

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
  setAside: z.array(
    z.object({
      fingerprint: FingerprintSchema,
      title: text,
      company: text,
      why: text,
    })
  ),
  /** The run's answer to each scout it read. */
  scouts: z.array(
    z.object({
      scoutId: IdSchema,
      verdict: z.enum(["agree", "disagree", "not-found"]),
      note: text,
      /** The pick it became, when it became one. */
      pickId: IdSchema.nullable(),
    })
  ),
  /** The Drive files this run read: decisions and scouts, by name. */
  read: z.array(text),
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
