/**
 * Runs Studio's Previews (HOST16, #3558): reads the previews where picks are
 * kept (`PreviewSource`: home, or a sample held in memory), and sends each
 * pick as the record's `approve` (`approveEvent`), one at a time. It owns
 * every wait and drops a read a newer one overtook (R1); the screen reads
 * its state and calls its intents.
 */
import type { HomeRead, HomeWrite } from "@some-ui/soundbites"
import type { ConversationEvent, PreviewPick } from "@some-ui/video-render"
import { approveEvent } from "@some-ui/video-render"

import type { Readable } from "@/lib/cell"
import { cell } from "@/lib/cell"

import type { ConversationPreviews, PreviewsState } from "./model"
import { movesFor, previewIn, READING, stepPreviews } from "./model"

/**
 * How keeping a pick went: what is kept now (null when it was kept and
 * couldn't be read back), why not, or an answer this phone can't read.
 */
export type PreviewWrite =
  | HomeWrite<ConversationPreviews | null>
  | { readonly kind: "unreadable" }

/** Where previews are read from and picks are kept. */
export type PreviewSource = {
  /** Home, or a sample whose picks are held in memory and never kept. */
  readonly where: "home" | "sample"
  readonly read: () => Promise<HomeRead<ReadonlyArray<ConversationPreviews>>>
  /** One conversation read again, as where picks are kept now holds it. */
  readonly reread: (
    conversation: string
  ) => Promise<HomeRead<ConversationPreviews>>
  /** Keeps `event` on `conversation`. */
  readonly approve: (
    conversation: string,
    event: Extract<ConversationEvent, { event: "approve" }>
  ) => Promise<PreviewWrite>
}

export type PreviewsRuntime = {
  readonly where: PreviewSource["where"]
  readonly state: Readable<PreviewsState>
  /** Reads the previews, again if they were read. */
  readonly open: () => void
  readonly pick: (
    conversation: string,
    preview: string,
    pick: PreviewPick
  ) => void
}

export function previewsRuntime(
  source: PreviewSource,
  now: () => string
): PreviewsRuntime {
  const state = cell<PreviewsState>(READING)
  // Each read's place: an answer to a read a newer one overtook is dropped.
  let reads = 0
  const dispatch = (event: Parameters<typeof stepPreviews>[1]): void => {
    state.set(stepPreviews(state.getSnapshot(), event))
  }
  const open = (): void => {
    dispatch({ kind: "again" })
    if (state.getSnapshot().phase !== "reading") return
    reads += 1
    const mine = reads
    void source.read().then((result) => {
      if (mine === reads) dispatch({ kind: "read", result })
    })
  }
  const pick = (
    conversation: string,
    preview: string,
    choice: PreviewPick
  ): void => {
    const before = state.getSnapshot()
    const offered = previewIn(before, conversation, preview)
    const held =
      before.phase === "shown"
        ? before.conversations.find((c) => c.id === conversation)
        : undefined
    dispatch({ kind: "pick", conversation, preview, pick: choice })
    const current = state.getSnapshot()
    if (offered === undefined || held === undefined) return
    if (current.phase !== "shown" || current.keeping === null) return
    const moves = movesFor(held, preview, choice)
    const event = approveEvent(
      offered,
      choice,
      now(),
      moves === undefined ? {} : { moves }
    )
    if (event === null) {
      dispatch({ kind: "picked", outcome: "refused" })
      return
    }
    void source.approve(conversation, event).then((written) => {
      dispatch(
        written.kind !== "written"
          ? { kind: "picked", outcome: written.kind }
          : written.value === null
            ? { kind: "picked", outcome: "kept" }
            : { kind: "picked", outcome: "kept", now: written.value }
      )
      // Refused, not read, or not answered (home may have kept it before
      // the answer was lost): read again, so the screen and the next pick
      // follow what is kept now. Busy and unpaired sent nothing.
      if (
        written.kind === "refused" ||
        written.kind === "unreadable" ||
        written.kind === "away"
      )
        void source.reread(conversation).then((again) => {
          if (again.kind === "read")
            dispatch({ kind: "refreshed", now: again.value })
        })
    })
  }
  return { where: source.where, state, open, pick }
}
