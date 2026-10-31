/**
 * Rust Rounds' way in from Practice Home (`@some-ui/rust-rounds/entry`): its
 * name, and where the session was left, read from the card kept on screen.
 * Light on purpose: it loads none of the formats' schemas, so the Home that
 * shows it carries none of the session's weight.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { isRecord, openKept, readJson } from "@some-ui/core-utils"

import { PLACE_KEY } from "./lib/play/keys"
import type { Title } from "./lib/play/store"
import { entryLine, WORDS } from "./lib/play/words"

export const RUST_ROUNDS_TITLE = WORDS.title

/** The kept card's title; null for none, or one this light read cannot make out. */
function titleOf(value: unknown): Title | null {
  const place = isRecord(value) ? value.place : null
  const title = isRecord(place) ? place.title : null
  if (!isRecord(title)) return null
  const { concept, number } = title
  return typeof concept === "string" && typeof number === "number"
    ? { concept, number }
    : null
}

/**
 * The entry's line: where the session was left, or what it is. Reads the
 * place record through the one kept-record reader; a value that is not a
 * record at all is moved aside there, as the session's own read would.
 */
export function rustRoundsEntry(storage: KeyedStorage | null): string {
  const read = readJson((value) =>
    isRecord(value) ? { title: titleOf(value) } : null
  )
  return entryLine(
    openKept(storage, PLACE_KEY, read, { title: null }).value.title
  )
}
