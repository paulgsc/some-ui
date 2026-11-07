/**
 * Studio's Calls (ST38, #2661): the runtime that owns home's requests and the
 * phone's copies of the weekly call's videos, so the screen only reads a
 * snapshot and says what was pressed (R1). Every port resolves; what each
 * answer means is `./model`'s.
 *
 * - **The list** is read once per open, drag down or Try again. A week whose
 *   whole video the phone already keeps reads as ready at once.
 * - **Watch** fetches a week's video into the phone's cache a part at a time
 *   (at most `partBytes` a request, so it is never held whole), then hands
 *   the screen its address. A week already fetching or ready isn't fetched
 *   again; one that failed is fetched again from the start.
 * - **Share** hands the fetched file to Android's share sheet (the `YouTube`
 *   app takes it from there).
 * - **Save** sends the pasted link only when it reads as a `YouTube` video,
 *   as home would read it, and once home kept it reads the list again, so
 *   the week shows the link as home holds it.
 */
import type {
  CallsEvent,
  CallsState,
  FetchFailure,
  LinkSaved,
  ListState,
  PartRead,
  Week,
} from "./model"
import { INITIAL, step, youtubeId } from "./model"

/** The phone's copies of the videos, in its cache. Every call resolves. */
export type VideoFiles = {
  /** How many bytes of a week's video the phone keeps, or `null`. */
  size: (from: string) => Promise<number | null>
  /** Writes (`first`) or appends a part, as base64; false if it couldn't. */
  put: (from: string, base64: string, first: boolean) => Promise<boolean>
  /** Where a kept video is: `uri` for sharing, `src` for the player. */
  where: (from: string) => Promise<{ uri: string; src: string } | null>
}

export type CallsPorts = {
  list: () => Promise<ListState>
  part: (
    from: string,
    start: number,
    end: number
  ) => Promise<PartRead | { readonly kind: "away" }>
  files: VideoFiles
  share: (
    uri: string,
    from: string
  ) => Promise<"shared" | "cancelled" | "failed">
  saveLink: (
    from: string,
    link: string
  ) => Promise<LinkSaved | { readonly kind: "away" }>
  /** The most bytes one part asks for. */
  partBytes: number
}

export type CallVideos = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => CallsState
  /** Reads the list (on open, a drag down, Try again). */
  open: () => Promise<void>
  watch: (from: string) => Promise<void>
  share: (from: string) => Promise<void>
  saveLink: (from: string, pasted: string) => Promise<void>
  /** The screen said what it had to say. */
  seen: () => void
}

/** Bytes of base64 text, without decoding it. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

export function createCallVideos(ports: CallsPorts): CallVideos {
  let state = INITIAL
  const listeners = new Set<() => void>()
  const dispatch = (event: CallsEvent): void => {
    state = step(state, event)
    for (const listener of listeners) listener()
  }
  const weekOf = (from: string): Week | undefined =>
    state.list.kind === "read"
      ? state.list.weeks.find((week) => week.from === from)
      : undefined

  /** A week whose whole video the phone keeps reads as ready. */
  const kept = async (week: Week): Promise<boolean> => {
    if (week.videoBytes === null) return false
    const size = await ports.files.size(week.from)
    if (size !== week.videoBytes) return false
    const where = await ports.files.where(week.from)
    if (where === null) return false
    dispatch({
      type: "fetchMoved",
      from: week.from,
      fetch: { kind: "ready", ...where },
    })
    return true
  }

  const failed = (from: string, why: FetchFailure): void => {
    dispatch({ type: "fetchMoved", from, fetch: { kind: "failed", why } })
  }

  const open = async (): Promise<void> => {
    dispatch({ type: "listAsked" })
    const list = await ports.list()
    dispatch({ type: "listEnded", list })
    if (list.kind !== "read") return
    for (const week of list.weeks) {
      if (state.fetches[week.from] === undefined) await kept(week)
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

    async watch(from): Promise<void> {
      const now = state.fetches[from]
      if (now?.kind === "fetching" || now?.kind === "ready") return
      const week = weekOf(from)
      const total = week?.videoBytes ?? null
      if (week === undefined || total === null) {
        failed(from, "gone")
        return
      }
      // In flight before the first wait, so a second Watch finds it fetching.
      dispatch({
        type: "fetchMoved",
        from,
        fetch: { kind: "fetching", done: 0, total },
      })
      if (await kept(week)) return
      for (let start = 0; start < total; ) {
        const end = Math.min(start + ports.partBytes, total) - 1
        const part = await ports.part(from, start, end)
        if (part.kind !== "bytes") {
          failed(from, part.kind === "gone" ? "gone" : "away")
          return
        }
        // Android's base64 may be wrapped in lines.
        const base64 = part.base64.replace(/\s/g, "")
        const got = decodedBytes(base64)
        if (got <= 0 || got > end - start + 1) {
          failed(from, "away")
          return
        }
        if (!(await ports.files.put(from, base64, start === 0))) {
          failed(from, "phone")
          return
        }
        start += got
        dispatch({
          type: "fetchMoved",
          from,
          fetch: { kind: "fetching", done: start, total },
        })
      }
      if (!(await kept(week))) failed(from, "phone")
    },

    async share(from): Promise<void> {
      const now = state.fetches[from]
      if (now?.kind !== "ready") return
      const shared = await ports.share(now.uri, from)
      if (shared === "failed") dispatch({ type: "shareFailed", from })
    },

    async saveLink(from, pasted): Promise<void> {
      if (state.links[from]?.kind === "saving") return
      if (youtubeId(pasted) === null) {
        dispatch({ type: "linkEnded", from, saved: { kind: "notAVideo" } })
        return
      }
      dispatch({ type: "linkSaving", from })
      const saved = await ports.saveLink(from, pasted.trim())
      dispatch({ type: "linkEnded", from, saved })
      // Read again, so the week shows the link as home kept it.
      if (saved.kind === "saved") await open()
    },

    seen(): void {
      dispatch({ type: "saidSeen" })
    },
  }
}
