/**
 * A cards essay's video on the phone (CARDS7, #2979): which essay Studio ›
 * Renders lists under a key, and where its video stands on the phone. Pure;
 * the requests and the phone's files are `./runtime`'s.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Fetch } from "@/lib/call-videos/model"
import type { Board } from "@/lib/renders/model"

/** The board's shelf for cards essays (paulgsc/server `feeds::renders`). */
const SHELF = "cards-essay"

/** Where essay `key` stands on home's board. */
export type Essay =
  /** Made: its video's size, where home said it. */
  | { readonly kind: "done"; readonly bytes: number | null }
  /** Home couldn't make it; Renders says why. */
  | { readonly kind: "failed" }
  /** Being made, waiting its turn, or not listed yet. */
  | { readonly kind: "notYet" }

export function essayOf(board: Board, key: string): Essay {
  const is = (row: { feed: string; key: string }): boolean =>
    row.feed === SHELF && row.key === key
  const done = board.done.find(is)
  if (done !== undefined) return { kind: "done", bytes: done.bytes ?? null }
  return board.failed.some(is) ? { kind: "failed" } : { kind: "notYet" }
}

export type EssayVideoState = {
  /** Where the video stands on the phone; none until Watch, or a kept copy. */
  readonly fetch: Fetch | undefined
}

export type EssayVideoEvent =
  | { readonly type: "fetchMoved"; readonly fetch: Fetch }
  /** The kept copy is gone (Android may clear the cache). */
  | { readonly type: "fetchForgotten" }

export const INITIAL: EssayVideoState = { fetch: undefined }

export function step(
  state: EssayVideoState,
  event: EssayVideoEvent
): EssayVideoState {
  switch (event.type) {
    case "fetchMoved": {
      return { fetch: event.fetch }
    }
    case "fetchForgotten": {
      return state.fetch?.kind === "ready" ? { fetch: undefined } : state
    }
    default: {
      return assertNever(event)
    }
  }
}
