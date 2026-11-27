/**
 * Shop (KPLAY's KP4, #2853): a hunch in English, spoken or typed, finds the
 * phrases that do it, and the ones the owner picks go in a basket that lasts
 * this session only.
 *
 * A pure machine, like the grammar lens's (`read-aloud/lens/machine`): `step`
 * takes an event and returns the next state and the effects to run, and
 * every request carries the number of the hunch that asked for it, so a late
 * answer to an earlier hunch changes nothing. `ShopRuntime` runs the effects
 * over a port to home (`ShopPort`), and a screen reads its snapshot and
 * dispatches events (`docs/monorepo-boundaries.md`, R1).
 *
 * Home decides. A spoken hunch is heard by home's Whisper, then home's meaning
 * index compares the hunch with every phrase's intents: above its threshold
 * it answers with the phrases, the close ones together; below it, home keeps
 * the hunch (its words, when) for the routine (KP5) and says so, in the same
 * answer, so a miss is never lost between two calls. A hunch left in flight
 * for another, or for "again", is still answered, and a miss is kept all the
 * same. A hunch home couldn't be reached for is not: a new hunch or "again"
 * lets it go unsent, and so does leaving the screen while a take is still
 * being heard, a gap the phone's side of KP4 closes (#3596).
 *
 * Memoryless (#2849): the basket is only this machine's state. Nothing here
 * stores it, and it is gone when the session ends. A phrase home names that
 * this build's shelf doesn't hold is left out; when none is left, the answer
 * is `unknown`: home found something only a newer build can show, and since
 * it was a hit home did not keep the hunch. A hit naming no phrase at all,
 * which home's route does not send, is read the same way.
 */

import { assertNever } from "@some-ui/core-utils"
import { isPhraseId, type PhraseId } from "@topik/lib/topik/phrases/shelf"

/** How a hunch came in: words typed, or a take spoken. */
type Hunch = Readonly<{ kind: "typed"; text: string } | { kind: "spoken" }>

/** Home's answer to a hunch's words. */
export type Lookup = Readonly<
  /** The phrases that do it, closest first. */
  | { kind: "hit"; phrases: ReadonlyArray<string> }
  /** Nothing did; home kept the hunch. */
  | { kind: "kept" }
>

export type ShopState = Readonly<{
  /** The phrases picked this session, in the order picked. */
  basket: ReadonlyArray<PhraseId>
  /** The number of the latest request: an answer to any other is stale. */
  seq: number
  /** How many hunches this session has sent: each one's number, for home. */
  hunches: number
  at:
    | { kind: "asking" }
    | { kind: "hearing"; number: number }
    | { kind: "looking"; words: string; number: number }
    | { kind: "found"; words: string; phrases: ReadonlyArray<PhraseId> }
    | { kind: "kept"; words: string }
    /** Home named only phrases this build doesn't hold. */
    | { kind: "unknown"; words: string }
    /**
     * Home couldn't be reached, or its answer was lost: the hunch may not be
     * kept. Sent again under its own number, home keeps it once.
     */
    | { kind: "unreached"; hunch: Hunch; number: number }
}>

export type ShopEvent = Readonly<
  | { kind: "hunch"; hunch: Hunch }
  /** `hunch` is the heard hunch's number, from its `hear` effect. */
  | { kind: "heard"; seq: number; hunch: number; words: string }
  | { kind: "answered"; seq: number; lookup: Lookup }
  | { kind: "unreached"; seq: number }
  /** Try the hunch home couldn't be reached for again. */
  | { kind: "retry" }
  | { kind: "pick"; phrase: PhraseId }
  | { kind: "put-back"; phrase: PhraseId }
  /** Back to asking, the basket kept. */
  | { kind: "again" }
>

export type ShopEffect = Readonly<
  | { kind: "hear"; seq: number; hunch: number }
  /** `hunch` is the hunch's number this session. */
  | { kind: "look-up"; seq: number; hunch: number; words: string }
>

export const initialShop: ShopState = {
  basket: [],
  seq: 0,
  hunches: 0,
  at: { kind: "asking" },
}

type Next = Readonly<{ state: ShopState; effects: ReadonlyArray<ShopEffect> }>

const stay = (state: ShopState): Next => ({ state, effects: [] })

/**
 * Send a hunch, to be heard first or its words looked up: a new one, or one
 * sent again under its own `number`.
 */
const send = (state: ShopState, hunch: Hunch, number?: number): Next => {
  const seq = state.seq + 1
  const words = hunch.kind === "typed" ? hunch.text.trim() : null
  if (words === "") return stay(state)
  const hunches = number === undefined ? state.hunches + 1 : state.hunches
  const sent = { ...state, seq, hunches }
  const hunchNumber = number ?? hunches
  if (words === null)
    return {
      state: { ...sent, at: { kind: "hearing", number: hunchNumber } },
      effects: [{ kind: "hear", seq, hunch: hunchNumber }],
    }
  return {
    state: { ...sent, at: { kind: "looking", words, number: hunchNumber } },
    effects: [{ kind: "look-up", seq, hunch: hunchNumber, words }],
  }
}

const answered = (
  state: ShopState,
  words: string,
  lookup: Lookup
): ShopState => {
  switch (lookup.kind) {
    case "hit": {
      const phrases = [...new Set(lookup.phrases)].filter(isPhraseId)
      return {
        ...state,
        at:
          phrases.length === 0
            ? { kind: "unknown", words }
            : { kind: "found", words, phrases },
      }
    }
    case "kept": {
      return { ...state, at: { kind: "kept", words } }
    }
    default: {
      return assertNever(lookup)
    }
  }
}

export const step = (state: ShopState, event: ShopEvent): Next => {
  switch (event.kind) {
    case "hunch": {
      return send(state, event.hunch)
    }
    case "heard": {
      const words = event.words.trim()
      const { hunch } = event
      if (event.seq !== state.seq || state.at.kind !== "hearing") {
        // The owner moved on: its words are still looked up, so home keeps a
        // miss, and the answer, under the old request, changes nothing.
        if (words === "") return stay(state)
        return {
          state,
          effects: [{ kind: "look-up", seq: event.seq, hunch, words }],
        }
      }
      // Nothing heard is nothing to look up or keep: ask again.
      if (words === "") return stay({ ...state, at: { kind: "asking" } })
      return {
        state: { ...state, at: { kind: "looking", words, number: hunch } },
        effects: [{ kind: "look-up", seq: state.seq, hunch, words }],
      }
    }
    case "answered": {
      if (event.seq !== state.seq || state.at.kind !== "looking")
        return stay(state)
      return stay(answered(state, state.at.words, event.lookup))
    }
    case "unreached": {
      if (event.seq !== state.seq) return stay(state)
      const { at } = state
      if (at.kind === "hearing")
        return stay({
          ...state,
          at: {
            kind: "unreached",
            hunch: { kind: "spoken" },
            number: at.number,
          },
        })
      if (at.kind === "looking")
        return stay({
          ...state,
          at: {
            kind: "unreached",
            hunch: { kind: "typed", text: at.words },
            number: at.number,
          },
        })
      return stay(state)
    }
    case "retry": {
      return state.at.kind === "unreached"
        ? send(state, state.at.hunch, state.at.number)
        : stay(state)
    }
    case "pick": {
      const { at } = state
      if (at.kind !== "found" || !at.phrases.includes(event.phrase))
        return stay(state)
      if (state.basket.includes(event.phrase)) return stay(state)
      return stay({ ...state, basket: [...state.basket, event.phrase] })
    }
    case "put-back": {
      if (!state.basket.includes(event.phrase)) return stay(state)
      return stay({
        ...state,
        basket: state.basket.filter((id) => id !== event.phrase),
      })
    }
    case "again": {
      if (state.at.kind === "asking") return stay(state)
      return stay({ ...state, at: { kind: "asking" } })
    }
    default: {
      return assertNever(event)
    }
  }
}
