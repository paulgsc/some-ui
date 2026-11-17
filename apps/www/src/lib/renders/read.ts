/**
 * Studio › Renders (SFEED13, #2761): one read of home's render jobs, asked
 * again while the link is busy, and what it came to. Kept out of the query's
 * module, which React imports (R1).
 */
import { askRenders } from "@/lib/home-link/renders"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { PhoneBusyError } from "@/lib/phone-busy"

import type { Board } from "./model"
import { readBoard } from "./model"

/** What a read came to: home's board, or why home can't give one. */
export type RendersOutcome =
  | { readonly kind: "read"; readonly board: Board }
  | { readonly kind: "older" }
  | { readonly kind: "unpaired" }

/** Home gave no answer to a read of its render jobs (AW1: away from home, say). */
export class RendersUnanswered extends Error {
  override name = "RendersUnanswered"
}

/**
 * Reads home's render jobs, asking again while the link is busy. Rejects
 * when home didn't answer (`RendersUnanswered`), the phone stayed busy with
 * home (`PhoneBusyError`, #3155), or its answer couldn't be read, so a page
 * keeps the board it last read and says so.
 */
export async function readRenders(): Promise<RendersOutcome> {
  const asked = await askWhileBusy(askRenders)
  if (asked.kind === "unpaired") return asked
  if (asked.kind === "busy") throw new PhoneBusyError("this phone was busy")
  if (asked.kind === "unreachable") {
    throw new RendersUnanswered("home didn't answer")
  }
  const read = readBoard(asked.answer)
  if (read.kind === "unreadable")
    throw new Error("home's answer was unreadable")
  return read
}
