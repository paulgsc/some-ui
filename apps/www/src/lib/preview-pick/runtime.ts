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
import { previewIn, READING, stepPreviews } from "./model"

/** Where previews are read from and picks are kept. */
export type PreviewSource = {
  /** Home, or a sample whose picks are held in memory and never kept. */
  readonly where: "home" | "sample"
  readonly read: () => Promise<HomeRead<ReadonlyArray<ConversationPreviews>>>
  /**
   * Keeps `event` on `conversation`: the conversation as it stands after
   * (null when it was kept and couldn't be read back), or why not.
   */
  readonly approve: (
    conversation: string,
    event: Extract<ConversationEvent, { event: "approve" }>
  ) => Promise<HomeWrite<ConversationPreviews | null>>
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
    const offered = previewIn(state.getSnapshot(), conversation, preview)
    dispatch({ kind: "pick", conversation, preview, pick: choice })
    const current = state.getSnapshot()
    if (offered === undefined || current.phase !== "shown") return
    if (current.keeping === null) return
    const event = approveEvent(
      offered,
      choice,
      now(),
      offered.standing === null ? {} : { moves: preview }
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
    })
  }
  return { where: source.where, state, open, pick }
}
