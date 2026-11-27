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
 * same. Nothing the owner typed is let go unsent (#3596): a look-up home
 * didn't answer is kept on this phone (`keep`), also once the screen is
 * gone, and sent when home is next reached, under the same name; the
 * screen says so, or that this phone couldn't keep it. A spoken take is
 * the port's to keep before it is heard (`hear`).
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

/**
 * How a hunch came in: words typed, or a take spoken, kept on this phone as
 * `note` under the hunch's `name`, which its look-up carries too.
 */
type Hunch = Readonly<
  | { kind: "typed"; text: string }
  | { kind: "spoken"; note: string; name: string }
>

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
    | { kind: "hearing"; number: number; note: string; name: string }
    /** `name` is a spoken hunch's, null for one typed. */
    | {
        kind: "looking"
        words: string
        number: number
        name: string | null
      }
    | { kind: "found"; words: string; phrases: ReadonlyArray<PhraseId> }
    | { kind: "kept"; words: string }
    /** Home named only phrases this build doesn't hold. */
    | { kind: "unknown"; words: string }
    /**
     * Home couldn't be reached, or its answer was lost. Sent again under its
     * own number, home keeps it once. `kept` is false once this phone
     * couldn't keep it either.
     */
    | {
        kind: "unreached"
        hunch: Hunch
        number: number
        kept: boolean
        name: string | null
      }
    /**
     * The spoken take isn't heard yet: home has it (`going` false), or it is
     * still on its way there (`going` true). Ask again.
     */
    | { kind: "unheard"; hunch: Hunch; number: number; going: boolean }
}>

export type ShopEvent = Readonly<
  | { kind: "hunch"; hunch: Hunch }
  /** `hunch` is the heard hunch's number, from its `hear` effect. */
  | { kind: "heard"; seq: number; hunch: number; name: string; words: string }
  /** Home didn't hear the take in time: it has it, or it is on its way. */
  | { kind: "unheard"; seq: number; going: boolean }
  | { kind: "answered"; seq: number; lookup: Lookup }
  /** Home couldn't be reached to hear the take. */
  | { kind: "unreached"; seq: number }
  /** This phone couldn't keep hunch `hunch`'s look-up for home. */
  | { kind: "unkept"; hunch: number }
  /** Home didn't answer a look-up of `words`, hunch `hunch`'s. */
  | {
      kind: "unanswered"
      seq: number
      hunch: number
      words: string
      name: string | null
    }
  /** Try the hunch home couldn't be reached for again. */
  | { kind: "retry" }
  | { kind: "pick"; phrase: PhraseId }
  | { kind: "put-back"; phrase: PhraseId }
  /** Back to asking, the basket kept. */
  | { kind: "again" }
>

export type ShopEffect = Readonly<
  /** Ask home to hear the spoken take `note`, hunch `name`. */
  | { kind: "hear"; seq: number; hunch: number; note: string; name: string }
  /**
   * `hunch` is the hunch's number this session; `name` a spoken hunch's
   * name, or null for the runtime to name a typed one by its number.
   */
  | {
      kind: "look-up"
      seq: number
      hunch: number
      words: string
      name: string | null
    }
  /** Keep a look-up home didn't answer, to send when home is next reached. */
  | { kind: "keep"; hunch: number; words: string; name: string | null }
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
const send = (
  state: ShopState,
  hunch: Hunch,
  number?: number,
  name: string | null = null
): Next => {
  const seq = state.seq + 1
  const words = hunch.kind === "typed" ? hunch.text.trim() : null
  if (words === "") return stay(state)
  const hunches = number === undefined ? state.hunches + 1 : state.hunches
  const sent = { ...state, seq, hunches }
  const hunchNumber = number ?? hunches
  if (hunch.kind === "spoken") {
    const { note, name: said } = hunch
    return {
      state: {
        ...sent,
        at: { kind: "hearing", number: hunchNumber, note, name: said },
      },
      effects: [{ kind: "hear", seq, hunch: hunchNumber, note, name: said }],
    }
  }
  return {
    state: {
      ...sent,
      at: { kind: "looking", words: words ?? "", number: hunchNumber, name },
    },
    effects: [
      { kind: "look-up", seq, hunch: hunchNumber, words: words ?? "", name },
    ],
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
      const { hunch, name } = event
      if (event.seq !== state.seq || state.at.kind !== "hearing") {
        // The owner moved on: its words are still looked up, so home keeps a
        // miss, and the answer, under the old request, changes nothing.
        if (words === "") return stay(state)
        return {
          state,
          effects: [{ kind: "look-up", seq: event.seq, hunch, words, name }],
        }
      }
      // Nothing heard is nothing to look up or keep: ask again.
      if (words === "") return stay({ ...state, at: { kind: "asking" } })
      return {
        state: {
          ...state,
          at: { kind: "looking", words, number: hunch, name },
        },
        effects: [{ kind: "look-up", seq: state.seq, hunch, words, name }],
      }
    }
    case "answered": {
      if (event.seq !== state.seq || state.at.kind !== "looking")
        return stay(state)
      return stay(answered(state, state.at.words, event.lookup))
    }
    case "unreached":
    case "unheard": {
      const { at } = state
      if (event.seq !== state.seq || at.kind !== "hearing") return stay(state)
      const hunch: Hunch = { kind: "spoken", note: at.note, name: at.name }
      // The take is kept on this phone, or on home, either way.
      return stay({
        ...state,
        at:
          event.kind === "unheard"
            ? { kind: "unheard", hunch, number: at.number, going: event.going }
            : {
                kind: "unreached",
                hunch,
                number: at.number,
                kept: true,
                name: at.name,
              },
      })
    }
    case "unanswered": {
      // Kept however late: the owner may have moved on, but not lost it.
      const { hunch, words, name } = event
      const effects = [{ kind: "keep", hunch, words, name }] as const
      const { at } = state
      if (event.seq !== state.seq || at.kind !== "looking")
        return { state, effects }
      return {
        state: {
          ...state,
          at: {
            kind: "unreached",
            hunch: { kind: "typed", text: at.words },
            number: at.number,
            kept: true,
            name: at.name,
          },
        },
        effects,
      }
    }
    case "unkept": {
      const { at } = state
      if (at.kind !== "unreached" || at.number !== event.hunch || !at.kept)
        return stay(state)
      return stay({ ...state, at: { ...at, kept: false } })
    }
    case "retry": {
      const { at } = state
      if (at.kind === "unreached")
        return send(state, at.hunch, at.number, at.name)
      if (at.kind === "unheard") return send(state, at.hunch, at.number)
      return stay(state)
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
