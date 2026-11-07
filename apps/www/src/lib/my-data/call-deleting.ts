/**
 * My data's let-go of a week of the call (ST38, #2661), white-gloved as a
 * recording's delete is (`./deleting`): the sheet's states and their pure
 * `step`, and what home's answers mean. `./call-deleting-runtime` owns the
 * request and the phone's copy; `./words`' `CALL_DELETING` says each state.
 *
 * - **Two steps, each asked once.** The video goes first, then the rest of
 *   the week's folder (takes, stills, cut list). Home holds the order and
 *   the link rule; the page offers a step only when home's list shows it can
 *   go (the week has a link, and for the rest, its video went).
 * - **It asks once,** "Keep it" first: `asked` opens the sheet, `confirmed`
 *   deletes. While it deletes, the sheet can't be closed or asked again.
 * - **Home's answer is final but for silence.** A receipt (`200`) is the
 *   step gone; a `409` (home keeps it: no link, the video first, or no
 *   video), a `404` (no such week) and a `401` (home forgot this phone)
 *   delete nothing and are never asked again. Only no answer, or the link
 *   being busy, offers Try again, a tap. Nothing retries on its own.
 *
 * LA19 (docs/learner-data-authority.md): `deleting` is reached only from
 * `asking`, or an `ended` sheet whose end is `away`.
 */
import { assertNever, readAs } from "@some-ui/core-utils"
import { z } from "zod"

import type { CallStep, CallStepAsked } from "@/lib/home-link/delete-note"

const ReceiptSchema = z.object({
  receipt: z.object({
    from: z.string(),
    step: z.enum(["video", "rest"]),
    url: z.string(),
    size: z.number().int().nonnegative(),
    deletedAt: z.string(),
  }),
})

/** A step's receipt, as home answers it. */
type CallReceipt = z.infer<typeof ReceiptSchema>["receipt"]

/** How a step's ask ended. */
export type CallStepEnd =
  | { readonly kind: "gone"; readonly receipt: CallReceipt }
  /** Home keeps it: no link yet, the video first, or no video. */
  | { readonly kind: "kept" }
  /** Home holds no such week. */
  | { readonly kind: "notHeld" }
  /** Home no longer knows this phone, or it isn't paired. */
  | { readonly kind: "forgotten" }
  /** No answer, or the link was busy: nothing was deleted. Try again. */
  | { readonly kind: "away" }

export function readCallStep(asked: CallStepAsked): CallStepEnd {
  switch (asked.kind) {
    case "answered": {
      const { status, body } = asked.answer
      if (status === 200) {
        const read = readAs(ReceiptSchema, body)
        return read === null
          ? { kind: "away" }
          : { kind: "gone", receipt: read.receipt }
      }
      if (status === 409) return { kind: "kept" }
      if (status === 404) return { kind: "notHeld" }
      if (status === 401) return { kind: "forgotten" }
      return { kind: "away" }
    }
    case "unpaired": {
      return { kind: "forgotten" }
    }
    case "busy":
    case "unreachable": {
      return { kind: "away" }
    }
    default: {
      return assertNever(asked)
    }
  }
}

/** The step a sheet is about: a week, which step, and how many bytes go. */
export type CallAsk = {
  readonly from: string
  readonly to: string
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
      return sheet.kind === "ended" && sheet.end.kind === "away"
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
