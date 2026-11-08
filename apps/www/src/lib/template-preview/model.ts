/**
 * A template's preview (SFEED12, #2757): a short video home makes of one
 * template from its sample, as the Templates page reads it, and what the page
 * is doing with it. Pure, so every answer and every turn is held by a test;
 * the runtime (`./runtime`) owns the requests and the phone's copy.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever, readAs } from "@some-ui/core-utils"
import { z } from "zod"

import type { Fetch } from "@/lib/call-videos/model"

/** Where a preview stands on home, in the words home's renders use. */
const PREVIEW_STATES = [
  "waiting",
  "rendering",
  "paused",
  "given-way",
  "ready",
  "failed",
] as const

export type PreviewStanding = (typeof PREVIEW_STATES)[number]

const PreviewSchema = z.object({
  id: z.string().min(1),
  /** The template version it was made from; known once it is ready. */
  version: z.number().int().positive().optional(),
  state: z.enum(PREVIEW_STATES),
  made_at: z.number().int().nonnegative().optional(),
  expires_at: z.number().int().nonnegative().optional(),
  bytes: z.number().int().positive().optional(),
  failed: z.string().min(1).optional(),
})

/** The newest preview of a template, as home holds it (`GET /previews/:template`). */
export type Preview = z.infer<typeof PreviewSchema>

const ReadSchema = z.object({ preview: PreviewSchema.nullable() })

/** What home's answer to a read says. */
export type PreviewRead =
  | { readonly kind: "read"; readonly preview: Preview | null }
  /** A home from before previews: it serves no such path. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

export function readPreview(answer: HomeAnswer): PreviewRead {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const read = readAs(ReadSchema, answer.body)
  if (read === null) return { kind: "unreadable" }
  // A ready preview the phone can't size can't be brought over.
  if (read.preview?.state === "ready" && read.preview.bytes === undefined)
    return { kind: "unreadable" }
  return { kind: "read", preview: read.preview }
}

/** What asking home to make a preview came to. */
export type MakeAsked =
  | { readonly kind: "asked" }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

const MadeSchema = z.object({
  id: z.string().min(1),
  state: z.enum(PREVIEW_STATES),
})

export function readMade(answer: HomeAnswer): MakeAsked {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200 && answer.status !== 202)
    return { kind: "unreadable" }
  return readAs(MadeSchema, answer.body) === null
    ? { kind: "unreadable" }
    : { kind: "asked" }
}

/** Home's preview, as the page shows it. */
export type HomeState =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly preview: Preview | null }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

/** Why a press of Preview didn't reach home, said once over the page. */
export type MakeFailure = Exclude<MakeAsked["kind"], "asked">

export type PreviewState = {
  readonly home: HomeState
  readonly asking: boolean
  /** The phone's copy of the preview named `id`. */
  readonly fetch: { readonly id: string; readonly fetch: Fetch } | null
  readonly said: Said | null
}

/** A read again that didn't come back, while the page still shows the last. */
export type ReadFailure = "away" | "unreadable"

/** What the page says once, over itself (a `Notice`). */
type Said =
  | { readonly kind: "makeFailed"; readonly why: MakeFailure }
  | { readonly kind: "readFailed"; readonly why: ReadFailure }

export const INITIAL: PreviewState = {
  home: { kind: "reading" },
  asking: false,
  fetch: null,
  said: null,
}

export type PreviewEvent =
  | { readonly type: "readAsked" }
  | { readonly type: "readEnded"; readonly home: HomeState }
  | { readonly type: "makeAsked" }
  | { readonly type: "makeEnded"; readonly made: MakeAsked }
  | { readonly type: "fetchMoved"; readonly id: string; readonly fetch: Fetch }
  | { readonly type: "fetchForgotten" }
  | { readonly type: "saidSeen" }

/** The ready preview home holds, if any. */
export function readyPreview(state: PreviewState): Preview | null {
  const { home } = state
  return home.kind === "read" && home.preview?.state === "ready"
    ? home.preview
    : null
}

/** The page's one way to change. */
export function step(state: PreviewState, event: PreviewEvent): PreviewState {
  switch (event.type) {
    case "readAsked": {
      // What was read stays on the page while it is read again.
      return state.home.kind === "read"
        ? state
        : { ...state, home: { kind: "reading" } }
    }
    case "readEnded": {
      // A read again that didn't come back keeps what was read on the page,
      // a preview being watched included, and says so once.
      if (
        state.home.kind === "read" &&
        (event.home.kind === "away" || event.home.kind === "unreadable")
      )
        return { ...state, said: { kind: "readFailed", why: event.home.kind } }
      const next = { ...state, home: event.home }
      // The phone's copy is of the ready preview home still holds, or none.
      return state.fetch !== null &&
        readyPreview(next)?.id !== state.fetch.id &&
        event.home.kind === "read"
        ? { ...next, fetch: null }
        : next
    }
    case "makeAsked": {
      return { ...state, asking: true }
    }
    case "makeEnded": {
      const { made } = event
      return made.kind === "asked"
        ? { ...state, asking: false }
        : {
            ...state,
            asking: false,
            said: { kind: "makeFailed", why: made.kind },
          }
    }
    case "fetchMoved": {
      return { ...state, fetch: { id: event.id, fetch: event.fetch } }
    }
    case "fetchForgotten": {
      return { ...state, fetch: null }
    }
    case "saidSeen": {
      return { ...state, said: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
