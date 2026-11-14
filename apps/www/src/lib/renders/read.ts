/**
 * Studio › Renders (SFEED13, #2761): one read of home's render jobs, asked
 * again while the link is busy, and what it came to. Kept out of the query's
 * module, which React imports (R1).
 */
import { askRenders } from "@/lib/home-link/renders"
import { askWhileBusy } from "@/lib/home-link/while-busy"

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
 * when home didn't answer (`RendersUnanswered`), the link stayed busy, or its
 * answer couldn't be read, so a page keeps the board it last read and says so.
 */
export async function readRenders(): Promise<RendersOutcome> {
  // Whether the last ask found home silent, as against the link staying busy.
  const last = { silent: false }
  const asked = await askWhileBusy(async () => {
    const each = await askRenders()
    last.silent = each.kind === "unreachable"
    return each
  })
  if (asked.kind === "unpaired") return asked
  if (asked.kind === "unreachable") {
    throw last.silent
      ? new RendersUnanswered("home didn't answer")
      : new Error("the link stayed busy")
  }
  const read = readBoard(asked.answer)
  if (read.kind === "unreadable")
    throw new Error("home's answer was unreadable")
  return read
}
