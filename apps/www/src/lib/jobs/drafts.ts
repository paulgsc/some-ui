/**
 * What I have typed into a pick's pass, fit note or debrief and not yet
 * kept: one draft per form, under the owner its voice notes use
 * (`pickOwner`), so leaving the app halfway loses nothing (JB1). Drafts are
 * not the record: they live under a `localStorage` key of their own, never
 * go home or into a share, and a form's draft is cleared once the event it
 * becomes is recorded.
 */
import { assertNever } from "@some-ui/core-utils"
import { DEBRIEF_RESULTS, FRICTION, PASS_REASONS } from "@some-ui/job-desk"
import { z } from "zod"

import type { StorageAdapter } from "@/lib/tenant/storage"

import type { DebriefResult, Draft, FrictionChip, PassReason } from "./model"
import { pickOwner } from "./model"

const DRAFTS_KEY = "some-ui:jobs:drafts"

export type PassDraft = {
  form: "pass"
  reasons: ReadonlyArray<PassReason>
  note: string
}

type FitDraft = { form: "fit"; note: string }

export type DebriefDraft = {
  form: "debrief"
  /** As typed; null while the form offers the timed minutes. */
  minutes: string | null
  friction: number | null
  chips: ReadonlyArray<FrictionChip>
  what: string
  result: DebriefResult | null
}

export type FormDraft = PassDraft | FitDraft | DebriefDraft

export type FormDrafts = Readonly<Record<string, FormDraft>>

const FormDraftSchema = z.discriminatedUnion("form", [
  z.object({
    form: z.literal("pass"),
    reasons: z.array(z.enum(PASS_REASONS)),
    note: z.string(),
  }),
  z.object({ form: z.literal("fit"), note: z.string() }),
  z.object({
    form: z.literal("debrief"),
    minutes: z.string().nullable(),
    friction: z.number().nullable(),
    chips: z.array(z.enum(FRICTION)),
    what: z.string(),
    result: z.enum(DEBRIEF_RESULTS).nullable(),
  }),
])

const DraftsSchema = z.record(z.string(), FormDraftSchema)

function isForm<F extends FormDraft["form"]>(
  draft: FormDraft | undefined,
  form: F
): draft is Extract<FormDraft, { form: F }> {
  return draft?.form === form
}

/** `owner`'s draft of `form`, or null while there is none. */
export function draftOf<F extends FormDraft["form"]>(
  drafts: FormDrafts,
  owner: string,
  form: F
): Extract<FormDraft, { form: F }> | null {
  const draft = drafts[owner]
  return isForm(draft, form) ? draft : null
}

/** `drafts` with `owner`'s set to `draft`, or cleared by null. */
export function withDraft(
  drafts: FormDrafts,
  owner: string,
  draft: FormDraft | null
): FormDrafts {
  if (draft !== null) return { ...drafts, [owner]: draft }
  if (!(owner in drafts)) return drafts
  return Object.fromEntries(
    Object.entries(drafts).filter(([key]) => key !== owner)
  )
}

/** The draft an event records, which it clears once kept; null for the rest. */
export function draftRecordedBy(event: Draft): string | null {
  switch (event.type) {
    case "passed": {
      return pickOwner(event.day, event.pickId, "pass")
    }
    case "fit-note": {
      return pickOwner(event.day, event.pickId, "fit")
    }
    case "debrief": {
      return pickOwner(event.day, event.pickId, "debrief")
    }
    case "taken":
    case "archived":
    case "resume-ready":
    case "apply-opened":
    case "outcome":
    case "disagree":
    case "scout":
    case "shared":
    case "arrived": {
      return null
    }
    default: {
      return assertNever(event)
    }
  }
}

/** The drafts kept on this phone; none when they can't be read. */
export function readDrafts(storage: StorageAdapter): FormDrafts {
  try {
    const raw = storage.getItem(DRAFTS_KEY)
    if (raw === null) return {}
    const parsed = DraftsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** Keeps `drafts`; false when the phone could not. */
export function writeDrafts(
  storage: StorageAdapter,
  drafts: FormDrafts
): boolean {
  try {
    storage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
    return true
  } catch {
    return false
  }
}
