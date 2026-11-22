/**
 * What the owner does on the Asks page, kept as a receipt per ask (C1096):
 * each option chosen and each step done is appended, with when and what
 * was pasted for it, blanked of secrets (`./blank`). Pure: the receipt, the
 * events that grow it, and the text one button copies for the owner to
 * paste into the session working on the ask. Nothing here is sent: the
 * receipt leaves the page only as that copy. Where it is kept is `./kept`.
 *
 * The receipt follows the ask's family (`AskFile`'s `kind`): a decision's
 * entries are choices, a checklist's are steps. A new kind of ask fails to
 * compile here until it says what its entries are.
 */
import { assertNever } from "@some-ui/core-utils"
import type { AskFile } from "@some-ui/video-render"
import { z } from "zod"

import { blankSecrets } from "./blank"
import type { OpenAsk } from "./model"

export const RECEIPT_SCHEMA = "some-ui.ask-receipt/1"

/** The longest a pasted result is kept: past it, the tail is cut. */
const PASTED_MOST = 20_000

export const EntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("chose"),
    /** The option, by its place in the ask's `options`. */
    option: z.number().int().nonnegative(),
    says: z.string(),
    at: z.iso.datetime({ offset: true }),
    /** What the owner added, if anything. */
    note: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal("step"),
    /** The step, by its place in the ask's `steps`. */
    step: z.number().int().nonnegative(),
    says: z.string(),
    at: z.iso.datetime({ offset: true }),
    /** What the owner pasted for it, if anything. */
    pasted: z.string().nullable(),
  }),
])

type Entry = z.infer<typeof EntrySchema>

/** One ask's receipt: its entries, oldest first. Never rewritten, only grown. */
export type Receipt = ReadonlyArray<Entry>

/** What the owner did: chose an option, or finished a step. */
export type ReceiptEvent =
  | {
      readonly kind: "chose"
      readonly option: number
      readonly note: string
      readonly at: Date
    }
  | {
      readonly kind: "step"
      readonly step: number
      readonly pasted: string
      readonly at: Date
    }

/** What a pasted text is kept as: blanked, trimmed, cut, or null if empty. */
function kept(text: string): string | null {
  const trimmed = blankSecrets(text).trim()
  if (trimmed === "") return null
  return trimmed.length > PASTED_MOST
    ? `${trimmed.slice(0, PASTED_MOST)}…`
    : trimmed
}

/** Whether `place` names one of `list`'s items. */
const placeIn = (place: number, list: ReadonlyArray<unknown>): boolean =>
  Number.isInteger(place) && place >= 0 && place < list.length

/**
 * `receipt` with `event` appended, or `receipt` itself when the event names
 * nothing `ask` holds (an option a checklist hasn't, a step past its last).
 */
export function appended(
  receipt: Receipt,
  ask: AskFile,
  event: ReceiptEvent
): Receipt {
  const at = event.at.toISOString()
  switch (ask.kind) {
    case "decision": {
      if (event.kind !== "chose") return receipt
      if (!placeIn(event.option, ask.options)) return receipt
      const option = ask.options[event.option]
      return [
        ...receipt,
        {
          kind: "chose",
          option: event.option,
          says: option.says,
          at,
          note: kept(event.note),
        },
      ]
    }
    case "checklist": {
      if (event.kind !== "step") return receipt
      if (!placeIn(event.step, ask.steps)) return receipt
      const step = ask.steps[event.step]
      return [
        ...receipt,
        {
          kind: "step",
          step: event.step,
          says: step.says,
          at,
          pasted: kept(event.pasted),
        },
      ]
    }
    default: {
      return assertNever(ask)
    }
  }
}

/** The steps done, by place. */
export const stepsDone = (receipt: Receipt): ReadonlySet<number> =>
  new Set(
    receipt.flatMap((entry) => (entry.kind === "step" ? [entry.step] : []))
  )

/** The option chosen last, by place, or null when none is. */
export function lastChosen(receipt: Receipt): number | null {
  let chosen: number | null = null
  for (const entry of receipt) if (entry.kind === "chose") chosen = entry.option
  return chosen
}

/** What is left of `ask` after `receipt`: the steps not done, by what each says. */
export function left(ask: AskFile, receipt: Receipt): ReadonlyArray<string> {
  switch (ask.kind) {
    case "decision": {
      return lastChosen(receipt) === null ? [ask.question] : []
    }
    case "checklist": {
      const done = stepsDone(receipt)
      return ask.steps.filter((_, place) => !done.has(place)).map((s) => s.says)
    }
    default: {
      return assertNever(ask)
    }
  }
}

/** The text one button copies: the ask, what was done, and what is left. */
export function receiptText(
  open: OpenAsk & { readonly ask: AskFile },
  receipt: Receipt
): string {
  return JSON.stringify(
    {
      schema: RECEIPT_SCHEMA,
      ask: open.id,
      url: open.url,
      kind: open.ask.kind,
      question: open.ask.question,
      done: receipt,
      left: left(open.ask, receipt),
    },
    null,
    2
  )
}
