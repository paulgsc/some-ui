import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

import type { StorageAdapter } from "@/lib/tenant/storage"

import type { Brief, Confirmation, SkipReason } from "./brief"
import { BriefSchema, ConfirmationSchema } from "./brief"

export type { Brief, Confirmation, ParsedBrief } from "./brief"
export {
  buildCommand,
  confirmationFileName,
  parseBrief,
  resumeFile,
  SKIP_REASONS,
} from "./brief"

/**
 * The phone's one job brief: none yet, open and being worked, or confirmed
 * (its confirmation shared, the next brief not yet opened). At most one at a
 * time, by design: the scheduled run writes the next brief only once this
 * one's confirmation reaches Drive.
 *
 * `step` is the whole policy; `./runtime` reads files, shares, and decides
 * which late result is stale. React only forwards events.
 */

type Draft = {
  outcome: Confirmation["outcome"] | null
  reason: SkipReason | null
  notes: string
}

export type Desk =
  | { kind: "empty" }
  | { kind: "open"; brief: Brief; draft: Draft }
  | { kind: "confirmed"; brief: Brief; confirmation: Confirmation }

export type DeskEvent =
  | { type: "opened"; brief: Brief }
  | { type: "outcome"; outcome: Confirmation["outcome"] }
  | { type: "reason"; reason: SkipReason }
  | { type: "notes"; notes: string }
  /** A confirmation went out through the share sheet. */
  | { type: "shared"; confirmation: Confirmation }

export const EMPTY: Desk = { kind: "empty" }

const BLANK: Draft = { outcome: null, reason: null, notes: "" }

export function step(desk: Desk, event: DeskEvent): Desk {
  switch (event.type) {
    case "opened": {
      // The same brief opened again keeps what was already done with it.
      if (desk.kind !== "empty" && desk.brief.id === event.brief.id) {
        return { ...desk, brief: event.brief }
      }
      return { kind: "open", brief: event.brief, draft: BLANK }
    }
    case "outcome":
    case "reason":
    case "notes": {
      if (desk.kind !== "open") return desk
      return { ...desk, draft: { ...desk.draft, ...draftPatch(event) } }
    }
    case "shared": {
      const briefId = event.confirmation.briefId
      if (desk.kind === "empty" || desk.brief.id !== briefId) return desk
      return {
        kind: "confirmed",
        brief: desk.brief,
        confirmation: event.confirmation,
      }
    }
    default: {
      return assertNever(event)
    }
  }
}

function draftPatch(
  event: Extract<DeskEvent, { type: "outcome" | "reason" | "notes" }>
): Partial<Draft> {
  switch (event.type) {
    case "outcome": {
      return { outcome: event.outcome }
    }
    case "reason": {
      return { reason: event.reason }
    }
    case "notes": {
      return { notes: event.notes }
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * What would be shared now: the open brief's draft once an outcome is
 * picked (a reason only for a skip), or the confirmation already shared,
 * sent again. Null while there is nothing to confirm.
 */
export function confirmationOf(desk: Desk, at: Date): Confirmation | null {
  if (desk.kind === "confirmed") return desk.confirmation
  if (desk.kind !== "open") return null
  const { brief, draft } = desk
  const { outcome } = draft
  if (outcome === null) return null
  return {
    schema: "some-ui.job-confirmation/1",
    briefId: brief.id,
    outcome,
    reason: outcome === "skipped" ? draft.reason : null,
    notes: draft.notes.trim(),
    at: at.toISOString(),
    resume: {
      variant: brief.resume.variant,
      template: brief.resume.template,
      ref: brief.resume.ref,
    },
  }
}

// Kept on this device, so a brief survives the app closing mid-application.

const STORAGE_KEY = "some-ui:job-desk"

const DeskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({
    kind: z.literal("open"),
    brief: BriefSchema,
    draft: z.object({
      outcome: ConfirmationSchema.shape.outcome.nullable(),
      reason: ConfirmationSchema.shape.reason,
      notes: z.string(),
    }),
  }),
  z.object({
    kind: z.literal("confirmed"),
    brief: BriefSchema,
    confirmation: ConfirmationSchema,
  }),
])

/** The kept desk; anything unreadable (an older shape, a torn write) is empty. */
export function loadDesk(storage: StorageAdapter): Desk {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return EMPTY
  try {
    const parsed = DeskSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY
  } catch {
    return EMPTY
  }
}

export function saveDesk(storage: StorageAdapter, desk: Desk): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(desk))
}
