/**
 * A template's preview (SFEED12, #2757): the runtime that owns home's
 * requests and the phone's copy of one template's preview, so the page only
 * reads a snapshot and says what was pressed (R1). Every port resolves; what
 * each answer means is `./model`'s.
 *
 * - **The read** happens on open, a drag down, Try again, and once after
 *   Preview. Nothing reads on a clock: the page says how far home has got
 *   when it is read.
 * - **Preview** asks home once; a press while one is asked does nothing.
 * - **Watch** brings the ready preview to the phone a part at a time
 *   (`fetchParts`, as Studio's feed videos do), then hands the page its
 *   address. A copy already on the phone, whole, reads as ready at once.
 */
import type { FetchFailure, PartRead } from "@/lib/call-videos/model"
import { fetchParts } from "@/lib/call-videos/parts"
import type { VideoFiles } from "@/lib/call-videos/runtime"

import type {
  HomeState,
  MakeAsked,
  Preview,
  PreviewEvent,
  PreviewState,
} from "./model"
import { INITIAL, readyPreview, step } from "./model"

export type PreviewPorts = {
  read: () => Promise<HomeState>
  make: () => Promise<MakeAsked>
  part: (
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

  /** A ready preview whose whole video the phone keeps reads as ready. */
  const kept = async (preview: Preview): Promise<boolean> => {
    const size = await ports.files.size(preview.id)
    if (size === null || size !== preview.bytes) return false
    const where = await ports.files.where(preview.id)
    if (where === null) return false
    dispatch({
      type: "fetchMoved",
      id: preview.id,
      fetch: { kind: "ready", ...where },
    })
    return true
  }

  const failed = (id: string, why: FetchFailure): void => {
    dispatch({ type: "fetchMoved", id, fetch: { kind: "failed", why } })
  }

  const open = async (): Promise<void> => {
    dispatch({ type: "readAsked" })
    const home = await ports.read()
    dispatch({ type: "readEnded", home })
    const ready = readyPreview(state)
    if (ready === null) return
    const now = state.fetch?.fetch
    if (now === undefined) {
      await kept(ready)
    } else if (now.kind === "ready" && !(await kept(ready))) {
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
      const now = state.fetch?.fetch
      if (now?.kind === "fetching" || now?.kind === "ready") return
      const ready = readyPreview(state)
      const total = ready?.bytes
      if (ready === null || total === undefined) return
      const { id } = ready
      // In flight before the first wait, so a second Watch finds it fetching.
      dispatch({
        type: "fetchMoved",
        id,
        fetch: { kind: "fetching", done: 0, total },
      })
      if (await kept(ready)) return
      // A newer read let this preview go: stop writing it.
      const stopped = (): boolean => state.fetch?.id !== id
      const ended = await fetchParts(
        {
          part: ports.part,
          put: (base64, first) => ports.files.put(id, base64, first),
          partBytes: ports.partBytes,
          stopped,
          moved: (done) => {
            dispatch({
              type: "fetchMoved",
              id,
              fetch: { kind: "fetching", done, total },
            })
          },
        },
        total
      )
      if (ended === "stopped") return
      if (ended !== "done") {
        failed(id, ended)
        return
      }
      if (!(await kept(ready))) failed(id, "phone")
    },

    seen(): void {
      dispatch({ type: "saidSeen" })
    },
  }
}
