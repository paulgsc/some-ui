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
       * Whether a pick's outcome is uncertain and the conversation is being
       * read again: no pick is taken until it is, since one would follow
       * what may no longer stand.
       */
      readonly reconciling: boolean
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
    }
  | {
      readonly kind: "picked"
      readonly outcome: Exclude<PickOutcome, "already">
      /** The conversation as it stands now, when where picks are kept said. */
      readonly now?: ConversationPreviews
    }
  /** A conversation read again, as where picks are kept now holds it. */
  | { readonly kind: "refreshed"; readonly now: ConversationPreviews }
  /** It couldn't be read again: why, and the screen asks again from the top. */
  | { readonly kind: "unreconciled"; readonly why: NotShown }

export const READING: PreviewsState = { phase: "reading" }

/** The outcomes after which what is kept is read again before the next pick. */
export const UNCERTAIN: ReadonlySet<PickOutcome> = new Set([
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

/** `pick` as the choice that stands, its rule its variant's. */
const keptOf = (
  offered: OfferedPreview,
  pick: PreviewPick
): KeptChoice | null => {
  if (pick.kind === "else") return { kind: "else", said: pick.said.trim() }
  const variant = offered.variants.find((v) => v.variant === pick.variant)
  return variant === undefined
    ? offered.standing
    : { kind: "variant", variant: variant.variant, rule: variant.rule }
}

/**
 * The approval a pick on `preview` moves, if any (C1581): its own standing
 * pick, else another standing preview of `conversation` that sets the rule
 * this pick would, since the record refuses a rule set twice unnamed.
 */
export function movesFor(
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
            conversations: event.result.value.conversations,
            unreadable: event.result.value.unreadable,
            keeping: null,
            said: null,
            reconciling: false,
          }
        : { phase: "nothing", why: event.result.kind }
    }
    case "again": {
      return state.phase === "shown" && state.keeping !== null ? state : READING
    }
    case "pick": {
      if (state.phase !== "shown" || state.keeping !== null) return state
      if (state.reconciling) return state
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
      const { keeping } = state
      const { now } = event
      // Kept, and not read back: the pick stands as sent, so the next pick
      // follows it (its move, or "already").
      const conversations =
        now !== undefined
          ? withNow(state.conversations, now)
          : event.outcome === "kept"
            ? state.conversations.map((c) =>
                c.id !== keeping.conversation
                  ? c
                  : {
                      ...c,
                      previews: c.previews.map((p) =>
                        p.preview === keeping.preview
                          ? { ...p, standing: keptOf(p, keeping.pick) }
                          : p
                      ),
                    }
              )
            : state.conversations
      return {
        ...state,
        conversations,
        keeping: null,
        said: said(state, event.outcome),
        reconciling: UNCERTAIN.has(event.outcome),
      }
    }
    case "refreshed": {
      return state.phase === "shown"
        ? {
            ...state,
            conversations: withNow(state.conversations, event.now),
            reconciling: false,
          }
        : state
    }
    case "unreconciled": {
      return state.phase === "shown" && state.reconciling
        ? { phase: "nothing", why: event.why }
        : state
    }
    default: {
      return assertNever(event)
    }
  }
}
