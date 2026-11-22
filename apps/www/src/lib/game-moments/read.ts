/**
 * One read of a game's moments, asked again while the link is busy. Kept
 * out of the query's module, which React imports (R1).
 */
import { askGameMoments } from "@/lib/home-link/game-moments"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { PhoneBusyError } from "@/lib/phone-busy"

import type { MomentsOutcome, MomentsReader } from "./model"
import { readGameMoments } from "./model"

/**
 * Reads `gameId`'s moments. Rejects when home didn't answer, the phone
 * stayed busy with home (`PhoneBusyError`) or the answer couldn't be read,
 * so the page keeps the moments it last read.
 */
export async function readMomentsOf(
  gameId: string,
  reader: MomentsReader
): Promise<MomentsOutcome> {
  const asked = await askWhileBusy(() => askGameMoments(gameId))
  if (asked.kind === "unpaired") return asked
  if (asked.kind === "busy") throw new PhoneBusyError("this phone was busy")
  if (asked.kind === "unreachable") throw new Error("home didn't answer")
  const read = readGameMoments(asked.answer, gameId, reader)
  if (read === null) throw new Error("home's answer was unreadable")
  return read
}
