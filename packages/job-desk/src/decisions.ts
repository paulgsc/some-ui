import { z } from "zod"

import {
  FingerprintSchema,
  IdSchema,
  parseWith,
  text,
  VoiceFileSchema,
  type Parsed,
} from "./shared"

/**
 * `some-ui.job-decisions/1`: what the phone shares back to Drive's
 * `some-ui jobs/Decisions/` as `decisions-<day>.json`, with the voice notes
 * it names beside it. It is how the routine learns: what I took, what I
 * passed and why, how applying went, and what happened afterwards. The
 * routine cannot reach home, so this file is its only view of the record.
 *
 * Append-only by convention: a later file never edits an earlier one. It
 * adds outcomes for earlier picks by fingerprint, and it restates a pick only
 * when I changed my mind about it; the newest file's entry for a fingerprint
 * is the decision that stands.
 */

export const PASS_REASONS = [
  "role",
  "customer-facing",
  "seniority",
  "pay",
  "location",
  "company",
  "closed",
  "other",
] as const

export const FRICTION = [
  "account-wall",
  "company-ats",
  "retyped-resume",
  "assessment",
  "cover-letter",
  "long-questionnaire",
  "form-broke",
] as const

export const OUTCOMES = [
  "viewed",
  "reply",
  "screen",
  "interview",
  "offer",
  "rejected",
  "no-reply-30d",
] as const

const DebriefSchema = z.object({
  /** From opening the posting to done, as I confirmed it. */
  minutes: z.number().int().min(1).max(600),
  /** 1 smooth, 5 nearly gave up. */
  friction: z.number().int().min(1).max(5),
  frictionChips: z.array(z.enum(FRICTION)),
  what: z.string(),
  voice: z.array(VoiceFileSchema),
  result: z.enum(["submitted", "gave-up", "closed"]),
})

export const DecisionsSchema = z.object({
  schema: z.literal("some-ui.job-decisions/1"),
  /** The day it was shared: `decisions-<day>.json`. */
  day: z.iso.date(),
  /** The newest digest whose picks it answers; each pick names its own. */
  digestDay: z.iso.date(),
  sharedAt: z.iso.datetime(),
  picks: z.array(
    z.object({
      /** The digest the pick came from: ids are unique only within one. */
      day: z.iso.date(),
      pickId: IdSchema,
      fingerprint: FingerprintSchema,
      decision: z.enum(["taken", "passed", "untouched"]),
      reasons: z.array(z.enum(PASS_REASONS)),
      note: z.string(),
      voice: z.array(VoiceFileSchema),
      debrief: DebriefSchema.nullable(),
    })
  ),
  /** Set-aside postings I'd have picked, and why. */
  disagreements: z.array(
    z.object({ fingerprint: FingerprintSchema, note: text })
  ),
  /** What happened later to any application, by its fingerprint. */
  outcomes: z.array(
    z.object({
      fingerprint: FingerprintSchema,
      event: z.enum(OUTCOMES),
      on: z.iso.date(),
      note: z.string(),
    })
  ),
})

export type Decisions = z.infer<typeof DecisionsSchema>

export function parseDecisions(raw: string): Parsed<Decisions> {
  return parseWith(DecisionsSchema, "a decisions file", raw)
}
