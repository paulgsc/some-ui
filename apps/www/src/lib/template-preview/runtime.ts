/**
 * A template's preview (SFEED12, #2757): the runtime that owns home's
 * requests and the phone's copy of one template's preview, so the page only
 * reads a snapshot and says what was pressed (R1). Every port resolves; what
 * each answer means is `./model`'s.
 *
 * - **The read** happens on open, a drag down, Try again, and once after
 *   Preview. Nothing reads on a clock: the page says how far home has got
 *   when it is read. A read that finds a newer preview, or none, lets the
 *   phone's copy of the old one go.
 * - **Preview** asks home once; a press while one is asked does nothing.
 * - **Watch** brings the ready preview over as Studio's feed videos bring an
 *   episode (`bringVideo`). Each Watch is its own run, stopped once a read
 *   lets its preview go.
 */
import type { PartRead } from "@/lib/call-videos/model"
import { bringVideo, keptCopy } from "@/lib/call-videos/parts"
import type { VideoFiles } from "@/lib/call-videos/runtime"

import type { HomeState, MakeAsked, PreviewEvent, PreviewState } from "./model"
import { INITIAL, readyPreview, step } from "./model"

export type PreviewPorts = {
  read: () => Promise<HomeState>
  make: () => Promise<MakeAsked>
  /** Bytes `start` to `end` of preview `id`'s video. */
  part: (
    id: string,
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  files: VideoFiles
  partBytes: number
}

export type TemplatePreview = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => PreviewState
  open: () => Promise<void>
  make: () => Promise<void>
  watch: () => Promise<void>
  seen: () => void
}

export function createTemplatePreview(ports: PreviewPorts): TemplatePreview {
  let state = INITIAL
  const listeners = new Set<() => void>()
  const dispatch = (event: PreviewEvent): void => {
    state = step(state, event)
    for (const listener of listeners) listener()
  }
  /** The Watch running now, by a number no other has; 0 while none. */
  let run = 0
  let runs = 0

  const open = async (): Promise<void> => {
    dispatch({ type: "readAsked" })
    const home = await ports.read()
    // The copy held as the read lands, a Watch pressed during it included.
    const had = state.fetch?.id ?? null
    dispatch({ type: "readEnded", home })
    if (had !== null && state.fetch === null) {
      // Home holds a newer preview, or none: stop the old one's Watch, and
      // let the phone's copy of it go.
      // A Watch still running lets its copy go itself once its last write
      // ends; with none, it goes now.
      if (run === 0) {
        await ports.files.remove(had)
      } else {
        run = 0
      }
    }
    const ready = readyPreview(state)
    if (ready?.bytes === undefined) return
    const now = state.fetch?.fetch
    if (now?.kind === "fetching") return
    const where = await keptCopy(ports.files, ready.id, ready.bytes)
    if (where !== null) {
      dispatch({
        type: "fetchMoved",
        id: ready.id,
        fetch: { kind: "ready", ...where },
      })
    } else if (now?.kind === "ready") {
      // Android may clear the cache while the app stays open.
      dispatch({ type: "fetchForgotten" })
    }
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,

    open,

    async make(): Promise<void> {
      if (state.asking) return
      dispatch({ type: "makeAsked" })
      const made = await ports.make()
      dispatch({ type: "makeEnded", made })
      if (made.kind === "asked") await open()
    },

    async watch(): Promise<void> {
      const ready = readyPreview(state)
      const total = ready?.bytes
      if (ready === null || total === undefined) return
      const now = state.fetch?.id === ready.id ? state.fetch.fetch : undefined
      if (now?.kind === "fetching" || now?.kind === "ready") return
      const { id } = ready
      runs += 1
      const mine = runs
      run = mine
      // In flight before the first wait, so a second Watch finds it fetching.
      dispatch({
        type: "fetchMoved",
        id,
        fetch: { kind: "fetching", done: 0, total },
      })
      await bringVideo(
        {
          files: ports.files,
          part: (start, end) => ports.part(id, start, end),
          partBytes: ports.partBytes,
          stopped: () => run !== mine,
          moved: (fetch) => {
            dispatch({ type: "fetchMoved", id, fetch })
          },
        },
        id,
        total
      )
      if (run === mine) {
        run = 0
      } else if (state.fetch?.id !== id) {
        // A read let this preview go while it came in, and no later Watch
        // brings it again.
        await ports.files.remove(id)
      }
    },

    seen(): void {
      dispatch({ type: "saidSeen" })
    },
  }
}
