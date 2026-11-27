/**
 * Studio's Previews as a state (HOST16, #3558; R1): the conversations whose
 * previews the agent offered, each preview with its standing pick, and a
 * pick on its way to where picks are kept. The runtime (`./runtime`) owns
 * every wait and dispatches what came back; this is what the screen reads.
 * Each step also returns what it asks of where picks are kept (a read, an
 * approval, a read again), and the runtime does exactly that and nothing
 * else: it never infers a request from the state.
 *
 * A pick is the record's `approve` (C1581, C1582). One pick is on its way at
 * a time, and the one that stands is home's: once home took it, the screen
 * shows the preview as home now holds it. Using the variant that stands
 * already asks nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type { HomeRead } from "@some-ui/soundbites"
import type {
  ConversationEvent,
  KeptChoice,
  PreviewOffer,
  PreviewPick,
} from "@some-ui/video-render"
import { approveEvent } from "@some-ui/video-render"

/** A preview as the screen shows it: the offer, each variant's clip, and its standing pick. */
export type OfferedPreview = PreviewOffer & {
  /** Each variant's clip, by variant, where this phone can play it; absent while it can't. */
  readonly clips: Readonly<Partial<Record<string, string>>>
  readonly standing: KeptChoice | null
}

/** One conversation's previews, in the order offered. */
export type ConversationPreviews = {
  readonly id: string
  /** What the conversation is about, as its heading says it. */
  readonly topic: string
  readonly previews: ReadonlyArray<OfferedPreview>
  /** How many of its offers can't be shown, their clips gone. */
  readonly unshown: number
}

/** What a read found: the conversations shown, and how many couldn't be read. */
export type PreviewsRead = {
  readonly conversations: ReadonlyArray<ConversationPreviews>
  /** Conversations whose records home couldn't read, so none of their previews show. */
  readonly unreadable: number
}

/** Why there are no previews to show. */
type NotShown = Exclude<HomeRead<never>["kind"], "read">

/** How a pick went. */
export type PickOutcome =
  | "kept"
  /** The variant that stands already: nothing was asked. */
  | "already"
  /** Where picks are kept didn't take it. */
  | "refused"
  /** Its answer couldn't be read: whether it was kept is read again. */
  | "unreadable"
  | "unpaired"
  /** No answer: whether it was kept is read again. */
  | "away"
  | "busy"

/** A pick on its way, or what it came to. */
type PickSaid = {
  /** Counts each outcome said, so the same words said again show again. */
  readonly n: number
  readonly outcome: PickOutcome
}

export type PreviewsState =
  | { readonly phase: "reading" }
  | { readonly phase: "nothing"; readonly why: NotShown }
  | {
      readonly phase: "shown"
      readonly conversations: ReadonlyArray<ConversationPreviews>
      /** Conversations home couldn't read. */
      readonly unreadable: number
      /** The pick on its way, if one is. */
      readonly keeping: {
        readonly conversation: string
        readonly preview: string
        readonly pick: PreviewPick
      } | null
      readonly said: PickSaid | null
      /**
       * A pick whose outcome is uncertain: its conversation is read again
       * (or, when that read `failed`, waits for Try again), and no pick is
       * taken until it is, since one would follow what may no longer stand.
       * The screen stays, so words not yet kept stay where they were typed.
       */
      readonly reconciling: {
        readonly conversation: string
        readonly failed: NotShown | null
      } | null
    }

export type PreviewsEvent =
  | {
      readonly kind: "read"
      readonly result: HomeRead<PreviewsRead>
    }
  | { readonly kind: "again" }
  | {
      readonly kind: "pick"
      readonly conversation: string
      readonly preview: string
      readonly pick: PreviewPick
      /** When the owner picked: the approval's `at`. */
      readonly at: string
    }
  | {
      readonly kind: "picked"
      readonly outcome: Exclude<PickOutcome, "already">
      /** The conversation as it stands now, when where picks are kept said. */
      readonly now?: ConversationPreviews
    }
  /** A conversation read again, as where picks are kept now holds it. */
  | { readonly kind: "refreshed"; readonly now: ConversationPreviews }
  /** It couldn't be read again: why, and the screen waits for Try again. */
  | { readonly kind: "unreconciled"; readonly why: NotShown }
  /** Try again: read the conversation again, after that read failed. */
  | { readonly kind: "reconcile" }

/** What a step asks of where picks are kept: the runtime does exactly this. */
export type PreviewsEffect =
  | { readonly kind: "read" }
  | {
      readonly kind: "approve"
      readonly conversation: string
      readonly event: Extract<ConversationEvent, { event: "approve" }>
    }
  /** Read one conversation again, after a pick whose outcome is uncertain. */
  | { readonly kind: "reread"; readonly conversation: string }

/** A step: the state after an event, and what it asks, if anything. */
export type PreviewsStep = {
  readonly state: PreviewsState
  readonly effect?: PreviewsEffect
}

export const READING: PreviewsState = { phase: "reading" }

/** The outcomes after which what is kept is read again before the next pick. */
const UNCERTAIN: ReadonlySet<PickOutcome> = new Set([
  "refused",
  "unreadable",
  "away",
])

/** Whether `pick` is the choice that stands. */
const stands = (standing: KeptChoice | null, pick: PreviewPick): boolean =>
  standing !== null &&
  (pick.kind === "variant"
    ? standing.kind === "variant" && standing.variant === pick.variant
    : standing.kind === "else" && standing.said === pick.said.trim())

const said = (
  state: Extract<PreviewsState, { phase: "shown" }>,
  outcome: PickOutcome
): PickSaid => ({ n: (state.said?.n ?? 0) + 1, outcome })

/**
 * `conversations` with `now` in its place; the topic the screen holds
 * kept, since a read back may not carry it.
 */
const withNow = (
  conversations: ReadonlyArray<ConversationPreviews>,
  now: ConversationPreviews
): ReadonlyArray<ConversationPreviews> =>
  conversations.map((c) =>
    c.id === now.id
      ? { ...now, topic: c.topic === "" ? now.topic : c.topic }
      : c
  )

/**
 * The approval a pick on `preview` moves, if any (C1581): its own standing
 * pick, else another standing preview of `conversation` that sets the rule
 * this pick would, since the record refuses a rule set twice unnamed.
 */
function movesFor(
  conversation: ConversationPreviews,
  preview: string,
  pick: PreviewPick
): string | undefined {
  const offered = conversation.previews.find((p) => p.preview === preview)
  if (offered === undefined) return undefined
  if (offered.standing !== null) return preview
  if (pick.kind !== "variant") return undefined
  const rule = offered.variants.find((v) => v.variant === pick.variant)?.rule
  return conversation.previews.find(
    (p) =>
      p.preview !== preview &&
      p.standing?.kind === "variant" &&
      p.standing.rule === rule
  )?.preview
}

/** The preview `preview` of conversation `conversation`, where it is shown. */
function previewIn(
  state: PreviewsState,
  conversation: string,
  preview: string
): OfferedPreview | undefined {
  return state.phase === "shown"
    ? state.conversations
        .find((c) => c.id === conversation)
        ?.previews.find((p) => p.preview === preview)
    : undefined
}

/**
 * The state after `event`, and what it asks of where picks are kept: pure,
 * so every order is a test, and a request is sent only when a step returns
 * it.
 */
export function stepPreviews(
  state: PreviewsState,
  event: PreviewsEvent
): PreviewsStep {
  switch (event.kind) {
    case "read": {
      return {
        state:
          event.result.kind === "read"
            ? {
                phase: "shown",
                conversations: event.result.value.conversations,
                unreadable: event.result.value.unreadable,
                keeping: null,
                said: null,
                reconciling: null,
              }
            : { phase: "nothing", why: event.result.kind },
      }
    }
    case "again": {
      return state.phase === "shown" && state.keeping !== null
        ? { state }
        : { state: READING, effect: { kind: "read" } }
    }
    case "pick": {
      if (state.phase !== "shown" || state.keeping !== null) return { state }
      if (state.reconciling !== null) return { state }
      const held = state.conversations.find((c) => c.id === event.conversation)
      const offered = previewIn(state, event.conversation, event.preview)
      if (held === undefined || offered === undefined) return { state }
      if (stands(offered.standing, event.pick))
        return { state: { ...state, said: said(state, "already") } }
      const moves = movesFor(held, event.preview, event.pick)
      const approve = approveEvent(
        offered,
        event.pick,
        event.at,
        moves === undefined ? {} : { moves }
      )
      // Not an approval the record could take (empty words): nothing sent,
      // so nothing is uncertain.
      if (approve === null)
        return { state: { ...state, said: said(state, "refused") } }
      return {
        state: {
          ...state,
          keeping: {
            conversation: event.conversation,
            preview: event.preview,
            pick: event.pick,
          },
        },
        effect: {
          kind: "approve",
          conversation: event.conversation,
          event: approve,
        },
      }
    }
    case "picked": {
      if (state.phase !== "shown" || state.keeping === null) return { state }
      const { keeping } = state
      const { now } = event
      // What stands is home's alone: a pick kept and read back shows what
      // home now holds. One refused, not read, not answered (home may have
      // kept it before the answer was lost), or kept and not read back, is
      // read again, so the screen and the next pick follow what home's own
      // record makes of it (its moves included). Busy and unpaired sent
      // nothing.
      const conversations =
        now === undefined
          ? state.conversations
          : withNow(state.conversations, now)
      const uncertain =
        UNCERTAIN.has(event.outcome) ||
        (event.outcome === "kept" && now === undefined)
      const next: PreviewsState = {
        ...state,
        conversations,
        keeping: null,
        said: said(state, event.outcome),
        reconciling: uncertain
          ? { conversation: keeping.conversation, failed: null }
          : null,
      }
      return uncertain
        ? {
            state: next,
            effect: { kind: "reread", conversation: keeping.conversation },
          }
        : { state: next }
    }
    case "refreshed": {
      return state.phase === "shown"
        ? {
            state: {
              ...state,
              conversations: withNow(state.conversations, event.now),
              reconciling: null,
            },
          }
        : { state }
    }
    case "unreconciled": {
      return state.phase === "shown" && state.reconciling !== null
        ? {
            state: {
              ...state,
              reconciling: { ...state.reconciling, failed: event.why },
            },
          }
        : { state }
    }
    case "reconcile": {
      if (state.phase !== "shown" || state.reconciling === null)
        return { state }
      const { conversation, failed } = state.reconciling
      if (failed === null) return { state }
      return {
        state: { ...state, reconciling: { conversation, failed: null } },
        effect: { kind: "reread", conversation },
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
