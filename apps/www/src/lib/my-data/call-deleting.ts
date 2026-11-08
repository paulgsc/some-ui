/**
 * My data's let-go of an episode of a feed, a week of the call or of Playoff
 * Delta (ST38, #2661; FEED4), white-gloved as a recording's delete is
 * (`./deleting`): the sheet's states and their pure
 * `step`, and what home's answers mean. `./call-deleting-runtime` owns the
 * request and the phone's copy; `./words`' `CALL_DELETING` says each state.
 *
 * - **Two steps, each asked once.** The video goes first, then the rest of
 *   the episode's folder (takes, stills, cut list). Home holds the order and
 *   the link rule; the page offers a step only when home's list shows it can
 *   go (the episode has a link, and for the rest, its video went).
 * - **It asks once,** "Keep it" first: `asked` opens the sheet, `confirmed`
 *   deletes. While it deletes, the sheet can't be closed or asked again.
 * - **Home's answer is final but for silence.** A receipt (`200`) is the
 *   step gone; a `409` (home keeps it: no link, the video first, or no
 *   video), a `404` (no such episode) and a `401` (home forgot this phone)
 *   delete nothing and are never asked again. Only no answer, or the link
 *   being busy, offers Try again, a tap. Nothing retries on its own.
 *
 * LA19 (docs/learner-data-authority.md): `deleting` is reached only from
 * `asking`, or an `ended` sheet whose end is `unanswered`.
 */
import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

import type { Feed } from "@/lib/call-videos/model"
import type { CallStep, CallStepAsked } from "@/lib/home-link/delete-note"

import type { HomeDeleteEnd } from "./deleting"
import { readHomeDelete } from "./deleting"

const ReceiptSchema = z.object({
  receipt: z.object({
    key: z.string(),
    step: z.enum(["video", "rest"]),
    url: z.string(),
    size: z.number().int().nonnegative(),
    deletedAt: z.string(),
  }),
})

/** A step's receipt, as home answers it. */
type CallReceipt = z.infer<typeof ReceiptSchema>["receipt"]

/**
 * How a step's ask ended: `kept` is home keeping it (no link yet, the video
 * first, or no video); `forgotten` also covers a phone not paired.
 */
export type CallStepEnd = HomeDeleteEnd<CallReceipt>

export function readCallStep(asked: CallStepAsked): CallStepEnd {
  switch (asked.kind) {
    case "answered": {
      return readHomeDelete(ReceiptSchema, asked.answer)
    }
    case "unpaired": {
      return { kind: "forgotten" }
    }
    case "busy":
    case "unreachable": {
      return { kind: "unanswered" }
    }
    default: {
      return assertNever(asked)
    }
  }
}

/**
 * The step a sheet is about: a feed's episode, which step, and how many
 * bytes go.
 */
export type CallAsk = {
  readonly feed: Feed
  readonly key: string
  readonly step: CallStep
  readonly bytes: number
}

export type CallSheet =
  | { readonly kind: "closed" }
  | { readonly kind: "asking"; readonly ask: CallAsk }
  | { readonly kind: "deleting"; readonly ask: CallAsk }
  | { readonly kind: "ended"; readonly ask: CallAsk; readonly end: CallStepEnd }

export const CLOSED: CallSheet = { kind: "closed" }

export type CallSheetEvent =
  | { readonly type: "asked"; readonly ask: CallAsk }
  | { readonly type: "confirmed" }
  | { readonly type: "answered"; readonly end: CallStepEnd }
  | { readonly type: "closed" }

/** The sheet's one way to change; an event it can't take leaves it as it is. */
export function stepCallSheet(
  sheet: CallSheet,
  event: CallSheetEvent
): CallSheet {
  switch (event.type) {
    case "asked": {
      return sheet.kind === "closed"
        ? { kind: "asking", ask: event.ask }
        : sheet
    }
    case "confirmed": {
      if (sheet.kind === "asking") return { kind: "deleting", ask: sheet.ask }
      return sheet.kind === "ended" && sheet.end.kind === "unanswered"
        ? { kind: "deleting", ask: sheet.ask }
        : sheet
    }
    case "answered": {
      return sheet.kind === "deleting"
        ? { kind: "ended", ask: sheet.ask, end: event.end }
        : sheet
    }
    case "closed": {
      return sheet.kind === "deleting" ? sheet : CLOSED
    }
    default: {
      return assertNever(event)
    }
  }
}
