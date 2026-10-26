/**
 * What I have typed into a pick's pass, fit note or debrief and not yet
 * kept: one draft per form, under the owner its voice notes use
 * (`pickOwner`), so leaving the app halfway loses nothing (JB1). Drafts are
 * not the record: they live under a `localStorage` key of their own, never
 * go home or into a share, and a form's draft is cleared once the event
 * that settles it is recorded.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  assertNever,
  openKept,
  salvageEntries,
  writeKept,
} from "@some-ui/core-utils"
import { FRICTION, PASS_REASONS } from "@some-ui/job-desk"
import { z } from "zod"

import type { Draft, FrictionChip, PassReason } from "./model"
import { pickOwner } from "./model"

const DRAFTS_KEY = "some-ui:jobs:drafts"
/** Followed by 1, 2 …: an unreadable value, kept as it was found. */
const QUARANTINE_PREFIX = "some-ui:jobs:drafts:unreadable:"

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
  }),
])

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

/**
 * The draft an event settles, which it clears once kept: a pass, fit note
 * or debrief its own form's, and taking a pick the pass it was not.
 */
export function draftRecordedBy(event: Draft): string | null {
  switch (event.type) {
    case "passed":
    case "taken": {
      return pickOwner(event.day, event.pickId, "pass")
    }
    case "fit-note": {
      return pickOwner(event.day, event.pickId, "fit")
    }
    case "debrief": {
      return pickOwner(event.day, event.pickId, "debrief")
    }
    case "archived":
    case "resume-ready":
    case "apply-opened":
    case "read":
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

/** The drafts, entry by entry: a draft it can't read is left out. */
const readEntries = salvageEntries((value): FormDraft | null => {
  const draft = FormDraftSchema.safeParse(value)
  return draft.success ? draft.data : null
})

/**
 * The drafts kept on this phone, each entry read on its own, and whether
 * they may be written: a value with any entry it can't read is first copied
 * aside, and when that fails (or the storage throws) nothing is written over
 * it, so the drafts last only while Jobs stays open.
 */
export function readDrafts(storage: KeyedStorage): {
  drafts: FormDrafts
  writable: boolean
} {
  const kept = openKept(storage, DRAFTS_KEY, readEntries, {}, QUARANTINE_PREFIX)
  return { drafts: kept.value, writable: kept.writable }
}

/** False when the phone could not keep `drafts`. */
export function writeDrafts(
  storage: KeyedStorage,
  drafts: FormDrafts
): boolean {
  return writeKept(storage, DRAFTS_KEY, drafts, readEntries, QUARANTINE_PREFIX)
}
