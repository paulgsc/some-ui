import { z } from "zod"

/**
 * The two files the job flow passes through Drive. A scheduled run writes one
 * `brief.json` (why this posting, which résumé to build, what to paste); the
 * phone reads it and shares back one `confirmation-<id>.json` (applied or
 * skipped, and notes). The run replaces a brief only once the confirmation
 * naming its `id` is in Drive, so these two shapes are the whole contract
 * between them: change one and the run's prompt changes with it.
 *
 * `__tests__/amplitude.brief.json` is a complete brief, and the template a
 * run copies.
 */

const text = z.string().trim().min(1)

/** `packages/ui/resume/src/main.typ`'s `variant` and `template` inputs. */
const RESUME_VARIANTS = ["backend", "platform", "fullstack"] as const
const RESUME_TEMPLATES = [
  "rail",
  "classic",
  "compact",
  "vanilla",
  "safe",
  "conventional",
] as const

const ResumeSchema = z.object({
  variant: z.enum(RESUME_VARIANTS),
  template: z.enum(RESUME_TEMPLATES),
  /** The some-ui commit to build at, after any tailoring for this posting landed. */
  ref: z.string().regex(/^[0-9a-f]{7,40}$/),
  /** What that commit changed for this posting, or null when nothing did. */
  tailoring: text.nullable(),
})

const LabelledSchema = z.object({ label: text, value: text })

export const BriefSchema = z.object({
  schema: z.literal("some-ui.job-brief/1"),
  /** Names the brief, its confirmation, and the résumé built for it. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/),
  createdAt: z.iso.datetime(),
  posting: z.object({
    title: text,
    company: text,
    location: text,
    compensation: text.nullable(),
    experience: text.nullable(),
    postedOn: z.iso.date().nullable(),
    verifiedOpenOn: z.iso.date().nullable(),
    applyUrl: z.url({ protocol: /^https$/ }),
  }),
  verdict: z.enum(["apply", "stretch"]),
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
  /** The some-ui and server commits the fits were checked at. */
  evidence: z.object({ someUi: text, server: text }),
})

export type Brief = z.infer<typeof BriefSchema>
export type Resume = Brief["resume"]

const SkipReasonSchema = z.enum(["role", "location", "pay", "closed", "other"])

export type SkipReason = z.infer<typeof SkipReasonSchema>

/** In the order the chips show. */
export const SKIP_REASONS: ReadonlyArray<readonly [SkipReason, string]> = [
  ["role", "Role mismatch"],
  ["location", "Location"],
  ["pay", "Pay"],
  ["closed", "Posting closed"],
  ["other", "Other"],
]

export const ConfirmationSchema = z.object({
  schema: z.literal("some-ui.job-confirmation/1"),
  briefId: BriefSchema.shape.id,
  outcome: z.enum(["applied", "skipped"]),
  reason: SkipReasonSchema.nullable(),
  notes: z.string(),
  at: z.iso.datetime(),
  resume: ResumeSchema.pick({ variant: true, template: true, ref: true }),
})

export type Confirmation = z.infer<typeof ConfirmationSchema>

export type ParsedBrief =
  | { ok: true; brief: Brief }
  | { ok: false; problem: string }

/** A picked file's text as a brief, or what is wrong with it, in words. */
export function parseBrief(raw: string): ParsedBrief {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, problem: "That file isn’t JSON." }
  }
  const parsed = BriefSchema.safeParse(json)
  if (parsed.success) return { ok: true, brief: parsed.data }
  const issue = parsed.error.issues.at(0)
  return {
    ok: false,
    problem: issue
      ? `Not a brief: ${issue.path.join(".") || "file"}: ${issue.message}`
      : "Not a brief.",
  }
}

export function confirmationFileName(briefId: string): string {
  return `confirmation-${briefId}.json`
}

/** The PDF `scripts/compile.mjs` writes for `resume` (rail has no suffix). */
export function resumeFile(
  resume: Pick<Resume, "variant" | "template">
): string {
  return resume.template === "rail"
    ? `resume-${resume.variant}.pdf`
    : `resume-${resume.variant}-${resume.template}.pdf`
}

/** Builds every résumé, checks included, at the brief's commit. */
export function buildCommand(resume: Pick<Resume, "ref">): string {
  return [
    `git fetch origin && git checkout ${resume.ref}`,
    "pnpm --filter @some-ui/resume exec node scripts/compile.mjs",
  ].join(" && ")
}
