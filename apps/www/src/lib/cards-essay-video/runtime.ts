/**
 * A cards essay's video (CARDS7, #2979): the runtime that owns the requests
 * for its parts and the phone's copy, so the page only reads a snapshot and
 * says what was pressed (R1). Every port resolves.
 *
 * - **Look** finds a whole copy the phone already keeps, given the size home
 *   said, so a video brought before plays at once. A look that lands after
 *   a Watch began changes nothing.
 * - **Watch** brings the video over as Studio's feed videos bring an episode
 *   (`bringVideo`); a press while one is coming, or once it is here, does
 *   nothing. Nothing here lets a video go: home keeps it, and the phone's
 *   cache is the phone's to clear.
 */
import type { PartRead } from "@/lib/call-videos/model"
import { bringVideo, keptCopy } from "@/lib/call-videos/parts"
import type { VideoFiles } from "@/lib/call-videos/runtime"

import type { EssayVideoEvent, EssayVideoState } from "./model"
import { INITIAL, step } from "./model"

export type EssayVideoPorts = {
  /** Bytes `start` to `end` of the essay's video. */
  part: (
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  files: VideoFiles
  partBytes: number
}

export type EssayVideo = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => EssayVideoState
  /** Finds a whole copy of the video, `bytes` long, the phone keeps. */
  look: (bytes: number) => Promise<void>
  /** Brings the video, `bytes` long, to the phone. */
  watch: (bytes: number) => Promise<void>
}

export function createEssayVideo(
  key: string,
  ports: EssayVideoPorts
): EssayVideo {
  let state = INITIAL
  const listeners = new Set<() => void>()
  const dispatch = (event: EssayVideoEvent): void => {
    state = step(state, event)
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,

    async look(bytes): Promise<void> {
      const before = state.fetch
      if (before?.kind === "fetching") return
      const where = await keptCopy(ports.files, key, bytes)
      // A Watch began, or another look moved it, while this one looked.
      if (state.fetch !== before) return
      if (where !== null) {
        dispatch({ type: "fetchMoved", fetch: { kind: "ready", ...where } })
      } else {
        dispatch({ type: "fetchForgotten" })
      }
    },

    async watch(bytes): Promise<void> {
      const now = state.fetch
      if (now?.kind === "fetching" || now?.kind === "ready") return
      // In flight before the first wait, so a second Watch finds it fetching.
      dispatch({
        type: "fetchMoved",
        fetch: { kind: "fetching", done: 0, total: bytes },
      })
      await bringVideo(
        {
          files: ports.files,
          part: ports.part,
          partBytes: ports.partBytes,
          stopped: () => false,
          moved: (fetch) => {
            dispatch({ type: "fetchMoved", fetch })
          },
        },
        key,
        bytes
      )
    },
  }
}
