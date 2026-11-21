/**
 * Asking home to hear a take again (#3339): one slice of state any screen
 * that shows takes composes, as it composes the play slice
 * (`@some-ui/voice-capture`'s home play). Takes on home and Takes › Needs
 * your attention both offer it: a take home couldn't hear, and one it heard
 * but may have heard wrong. Pure; each screen's machine calls these steps
 * and runs the effect through its runtime's port, and the words are
 * `./words`'.
 *
 * Rules that hold by structure:
 *
 * - **Asked only where home says it will hear it again,** and not while home
 *   is hearing it nor until the time home says it can be asked again
 *   (`askable`). Home holds the snooze; the phone only shows it.
 * - **One ask at a time,** and an answer counts only for the ask made last.
 * - **What home says wins.** An answer changes only the take asked of, laid
 *   over the list as it was read (`changed`); a fresh read, home's own word
 *   on every take, clears what was laid over it.
 */

/** Whether home hears a take again on the owner's ask: when it can next be asked (null: now), and whether it is hearing it. */
export type HearAgain = {
  readonly askAgainAt: string | null
  readonly hearing: boolean
}

/** What came of an ask. */
export type HearAgainAnswer =
  /** Home will hear it again (`asked`), or was asked too recently (`snoozed`): when it can next be asked. */
  | { readonly kind: "asked" | "snoozed"; readonly askAgainAt: string | null }
  /** Home doesn't hold the take, or hears nothing more in it. */
  | { readonly kind: "settled" }
  /** Home didn't take it, or didn't answer: nothing changed. */
  | { readonly kind: "notTaken" }
  /** This phone stayed busy with home, so home wasn't told: nothing changed. */
  | { readonly kind: "busy" }

/** What the screen says of the last ask, on the take it was of. */
type HearAgainSaid = {
  readonly id: string
  readonly kind: HearAgainAnswer["kind"]
}

export type HearAgainSlice = {
  readonly hearAgain: {
    /** The take home is being asked of; null while none is. */
    readonly asking: string | null
    /** Each ask's number: an answer to an earlier one changes nothing. */
    readonly asks: number
    readonly said: HearAgainSaid | null
    /** What home said of a take since the list was read, by its id. */
    readonly changed: ReadonlyMap<string, HearAgain>
  }
}

export type HearAgainEffect = {
  readonly type: "sendHearAgain"
  readonly seq: number
  readonly id: string
}

export type HearAgainStep<S> = {
  readonly state: S
  readonly effects: ReadonlyArray<HearAgainEffect>
}

export const QUIET_HEAR_AGAIN: HearAgainSlice = {
  hearAgain: { asking: null, asks: 0, said: null, changed: new Map() },
}

/** Whether a take can be asked to be heard again now: home says so, and isn't hearing it. */
export const askable = (hearAgain: HearAgain | null): boolean =>
  hearAgain !== null && !hearAgain.hearing && hearAgain.askAgainAt === null

/** A take's hear-again as the screen shows it: what home said since the read, else the read's. */
export const hearAgainOf = (
  state: HearAgainSlice,
  take: { readonly id: string; readonly hearAgain?: HearAgain | null }
): HearAgain | null =>
  state.hearAgain.changed.get(take.id) ?? take.hearAgain ?? null

/**
 * Asks home to hear take `take` again, if it can be asked now and no ask is
 * under way; otherwise nothing.
 */
export function askedToHearAgain<S extends HearAgainSlice>(
  state: S,
  take: { readonly id: string; readonly hearAgain?: HearAgain | null }
): HearAgainStep<S> {
  const slice = state.hearAgain
  if (slice.asking !== null || !askable(hearAgainOf(state, take))) {
    return { state, effects: [] }
  }
  const seq = slice.asks + 1
  return {
    state: {
      ...state,
      hearAgain: { ...slice, asking: take.id, asks: seq, said: null },
    },
    effects: [{ type: "sendHearAgain", seq, id: take.id }],
  }
}

/** Home's answer to ask `seq`: the take asked of as home now says it, and what the screen says. */
export function hearAgainAnswered<S extends HearAgainSlice>(
  state: S,
  seq: number,
  answer: HearAgainAnswer
): S {
  const slice = state.hearAgain
  const id = slice.asking
  if (seq !== slice.asks || id === null) return state
  const changed = new Map(slice.changed)
  if (answer.kind === "asked" || answer.kind === "snoozed") {
    const before = changed.get(id)
    changed.set(id, {
      askAgainAt: answer.askAgainAt,
      hearing: answer.kind === "asked" || (before?.hearing ?? false),
    })
  }
  return {
    ...state,
    hearAgain: {
      ...slice,
      asking: null,
      said: { id, kind: answer.kind },
      changed,
    },
  }
}

/** A fresh read of home: its word on every take replaces what was laid over it. */
export const hearAgainRead = <S extends HearAgainSlice>(state: S): S =>
  state.hearAgain.changed.size === 0
    ? state
    : { ...state, hearAgain: { ...state.hearAgain, changed: new Map() } }

/** The person closed what the screen said of the last ask. */
export const hearAgainDismissed = <S extends HearAgainSlice>(state: S): S =>
  state.hearAgain.said === null
    ? state
    : { ...state, hearAgain: { ...state.hearAgain, said: null } }
