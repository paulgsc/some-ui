/**
 * A cards essay's video on the phone (CARDS7, #2979): which essay Studio ›
 * Renders lists under a key, and where its video stands on the phone. Pure;
 * the requests and the phone's files are `./runtime`'s.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Fetch } from "@/lib/call-videos/model"
import type { Board } from "@/lib/renders/model"

/** The board's shelf for cards essays (paulgsc/server `feeds::renders`). */
export const SHELF = "cards-essay"

/** An essay home finished: its video's size, where home said it. */
export type Essay = { readonly bytes: number | null }

/** The essay `key` home has finished, or `null` while it hasn't (or lists none). */
export function essayOf(board: Board, key: string): Essay | null {
  const done = board.done.find((row) => row.feed === SHELF && row.key === key)
  return done === undefined ? null : { bytes: done.bytes ?? null }
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
