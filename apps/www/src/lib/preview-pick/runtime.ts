/**
 * Runs Studio's Previews (HOST16, #3558): reads the previews where picks are
 * kept (`PreviewSource`: home, or a sample held in memory), and sends each
 * pick as the record's `approve`, one at a time. It owns every wait and
 * drops a read a newer one overtook (R1), and sends only the effects
 * `stepPreviews` returns; the screen reads its state and calls its intents.
 */
import { assertNever } from "@some-ui/core-utils"
import type { HomeRead, HomeWrite } from "@some-ui/soundbites"
import type { ConversationEvent, PreviewPick } from "@some-ui/video-render"

import type { Readable } from "@/lib/cell"
import { cell } from "@/lib/cell"

import type {
  ConversationPreviews,
  PreviewsEffect,
  PreviewsEvent,
  PreviewsRead,
  PreviewsState,
} from "./model"
import { READING, stepPreviews } from "./model"

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
  readonly read: () => Promise<HomeRead<PreviewsRead>>
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
  // Sends what a step returned, and only that: no request is inferred from
  // the state.
  const run = (effect: PreviewsEffect): void => {
    switch (effect.kind) {
      case "read": {
        reads += 1
        const mine = reads
        void source.read().then((result) => {
          if (mine === reads) dispatch({ kind: "read", result })
        })
        return
      }
      case "approve": {
        void source
          .approve(effect.conversation, effect.event)
          .then((written) => {
            dispatch(
              written.kind !== "written"
                ? { kind: "picked", outcome: written.kind }
                : written.value === null
                  ? { kind: "picked", outcome: "kept" }
                  : { kind: "picked", outcome: "kept", now: written.value }
            )
          })
        return
      }
      case "reread": {
        void source.reread(effect.conversation).then((again) => {
          dispatch(
            again.kind === "read"
              ? { kind: "refreshed", now: again.value }
              : { kind: "unreconciled", why: again.kind }
          )
        })
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }
  function dispatch(event: PreviewsEvent): void {
    const step = stepPreviews(state.getSnapshot(), event)
    state.set(step.state)
    if (step.effect !== undefined) run(step.effect)
  }
  return {
    where: source.where,
    state,
    open: (): void => {
      dispatch({ kind: "again" })
    },
    pick: (conversation, preview, pick): void => {
      dispatch({ kind: "pick", conversation, preview, pick, at: now() })
    },
  }
}
