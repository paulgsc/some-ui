/**
 * Studio's Previews as a state (HOST16, #3558; R1): the conversations whose
 * previews the agent offered, each preview with its standing pick, and a
 * pick on its way to where picks are kept. The runtime (`./runtime`) owns
 * every wait and dispatches what came back; this is what the screen reads.
 *
 * A pick is the record's `approve` (C1581, C1582). One pick is on its way at
 * a time, and the one that stands is home's: once home took it, the screen
 * shows the preview as home now holds it. Using the variant that stands
 * already asks nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type { HomeRead } from "@some-ui/soundbites"
import type {
  KeptChoice,
  PreviewOffer,
  PreviewPick,
} from "@some-ui/video-render"

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

/** Why there are no previews to show. */
type NotShown = Exclude<HomeRead<never>["kind"], "read">

/** How a pick went. */
export type PickOutcome =
  | "kept"
  /** The variant that stands already: nothing was asked. */
  | "already"
  /** Where picks are kept didn't take it. */
  | "refused"
  | "unpaired"
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
      /** The pick on its way, if one is. */
      readonly keeping: {
        readonly conversation: string
        readonly preview: string
        readonly pick: PreviewPick
      } | null
      readonly said: PickSaid | null
    }

export type PreviewsEvent =
  | {
      readonly kind: "read"
      readonly result: HomeRead<ReadonlyArray<ConversationPreviews>>
    }
  | { readonly kind: "again" }
  | {
      readonly kind: "pick"
      readonly conversation: string
      readonly preview: string
      readonly pick: PreviewPick
    }
  | {
      readonly kind: "picked"
      readonly outcome: Exclude<PickOutcome, "already">
      /** The conversation as it stands now, when where picks are kept said. */
      readonly now?: ConversationPreviews
    }

export const READING: PreviewsState = { phase: "reading" }

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

/** The preview `preview` of conversation `conversation`, where it is shown. */
export function previewIn(
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

/** The state after `event`: pure, so every order is a test. */
export function stepPreviews(
  state: PreviewsState,
  event: PreviewsEvent
): PreviewsState {
  switch (event.kind) {
    case "read": {
      return event.result.kind === "read"
        ? {
            phase: "shown",
            conversations: event.result.value,
            keeping: null,
            said: null,
          }
        : { phase: "nothing", why: event.result.kind }
    }
    case "again": {
      return state.phase === "shown" && state.keeping !== null ? state : READING
    }
    case "pick": {
      if (state.phase !== "shown" || state.keeping !== null) return state
      const offered = previewIn(state, event.conversation, event.preview)
      if (offered === undefined) return state
      if (stands(offered.standing, event.pick))
        return { ...state, said: said(state, "already") }
      return {
        ...state,
        keeping: {
          conversation: event.conversation,
          preview: event.preview,
          pick: event.pick,
        },
      }
    }
    case "picked": {
      if (state.phase !== "shown" || state.keeping === null) return state
      const { now } = event
      return {
        phase: "shown",
        conversations:
          now === undefined
            ? state.conversations
            : state.conversations.map((c) => (c.id === now.id ? now : c)),
        keeping: null,
        said: said(state, event.outcome),
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
