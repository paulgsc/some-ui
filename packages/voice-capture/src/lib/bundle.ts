/**
 * A set of answers said as one bundle, as one state machine (STUDIO ST26,
 * #2453; RR13 #2688): a screen before the
 * cards (`intro`: what a new idea is, a week's brief), then its items, one
 * card each, swiped between, each answer said as a take on the take pattern
 * and heard back, then the whole set looked over and sent together.
 * `stepBundle(spec, state, event)` returns the next state and the effects to
 * run and does nothing else; `./bundle-runtime` runs them against the take
 * pattern, the draft, the records kept and home, and a screen renders a
 * state and turns taps into events (docs/monorepo-boundaries.md, "Inside a
 * React package"). Its cards and review are `@some-ui/shared`'s
 * `BundleCards` and `BundleReview`.
 *
 * What a bundle is about is its `BundleSpec`: the items, how a take names
 * what it answers, the draft's own fields and their edits, what Send keeps
 * and what it still needs. Studio's new idea (`@some-ui/soundbites`' `lib/idea/bundle`)
 * and Rust Rounds' week of tickets (RR13) are its specs.
 *
 * Rules that hold by structure, whatever the spec:
 *
 * - **Nothing leaves before Send.** Each take is kept on the take pattern
 *   with `send: "on-confirm"`, waiting on the phone; Send adds the record,
 *   whole and dated, to the records kept, and only then lets go the takes it
 *   names (`send`'s `release`), and only those (`settle` too).
 * - **One take per answer before Send.** Saying an answer again replaces
 *   its take: once the new one is kept, the one it replaced, which never
 *   left the phone, is deleted for good (`drop`). So, when the screen
 *   opens, is a waiting take of a kept record that the record doesn't name
 *   (a Send cut short). A take is deleted only on the word of what owns its
 *   record, read whole: one whose record nothing readable holds (a draft or
 *   a record set aside as unreadable) keeps waiting, never guessed at.
 * - **Deleting before Send is gone for good, and asks first** (the owner's
 *   ruling on #2265): one answer, every take it has (`askDelete`, then
 *   `confirmed`), or the whole draft (`askDeleteAll`). Besides `drop`,
 *   nothing else deletes.
 * - **A take starts only once its draft is kept** (`tap`'s `draft`), so no
 *   take answers a draft this phone doesn't hold.
 * - **Typing is the fallback, never the default, and only where the spec
 *   offers it** (`typing`). A card offers typing only once voice didn't
 *   come through for it (a take the microphone refused, or that failed, or
 *   one kept with no voice heard in it) or the phone had no room for one,
 *   and a typed answer offers "Say it instead": a take kept for it takes
 *   the typed words' place. Words typed for a take kept unheard stand
 *   beside that take (`beside`, ST34): it is never let go for them, and both
 *   go with the record. Which take was kept unheard is kept on the draft
 *   (`unheard`), so the offer outlives a try that fails and the screen
 *   coming back. Only a take's end decides what becomes of typed words:
 *   kept heard, it takes their place; kept unheard, they stand beside it.
 *   The take list, which can arrive before or after that end, never does. A
 *   take whose end the screen never saw (kept after it went) sets the words
 *   it answers in place of aside when the screen opens (`overtaken`): kept,
 *   never shown or sent, so no later take kept unheard brings them back.
 * - **Nothing moves while a take is under way**: a swipe, a dot, Look it
 *   over and Back wait until it ends, and leaving the screen, or the page
 *   hiding (the app sent to the background), finishes and keeps it.
 * - **One play at a time.** Play all plays each answer's take in order,
 *   one after the other, and any other play or tap stops it.
 * - **Send needs the required items answered and whatever else the spec
 *   needs** (`missing`); the other items can wait, and go as passed over.
 * - **A draft sent opens on what was sent.** A fresh draft whose id a kept
 *   record already has (a week, whose id is the week's) opens on the sent
 *   screen, never as a second draft answering the same items.
 */
import { assertNever } from "@some-ui/core-utils"

import type { TakeEnded } from "./take-kit"
import type { PatternTake } from "./take-pattern"
import { currentTakeOf } from "./take-view"

/**
 * The fields of a draft the machine reads and writes, by item; a spec's
 * draft adds its own (an idea's `about`), which only its `edit` changes.
 */
export type BundleDraft<I extends string = string> = {
  /** The record's id once sent: letters, digits and dashes. */
  readonly id: string
  /** ISO time it was started: the date it is known by. */
  readonly at: string
  /** Answers typed because voice didn't work, at most `typedMax` long. */
  readonly typed: Partial<Readonly<Record<I, string>>>
  /**
   * Typed words that stand beside a take kept with no voice heard in it
   * (ST34): that take's id, by the item both answer. The take stays, and
   * both go with the record. Absent when none do.
   */
  readonly beside?: Partial<Readonly<Record<I, string>>>
  /**
   * By item, its last take kept, when that take held no voice heard (ST34):
   * its card offers typing beside it until a take heard replaces it,
   * however often the screen came and went or a try failed in between.
   * Absent when none is.
   */
  readonly unheard?: Partial<Readonly<Record<I, string>>>
  /**
   * Typed words a take has since answered in place of, with no end of it
   * seen (kept while the screen was gone), by item, oldest first (ST34).
   * Kept, never shown or sent, so a later take kept unheard never brings
   * them back as the answer. Absent when there are none.
   */
  readonly overtaken?: Partial<Readonly<Record<I, ReadonlyArray<string>>>>
  /** Items left to come back to, in the order they were left. */
  readonly later: ReadonlyArray<I>
}

/** What a bundle is about: the types its spec fills in. */
export type BundleKind = {
  /** An item's id: a question, a ticket. */
  readonly item: string
  readonly draft: BundleDraft
  /** What Send keeps, whole and dated. */
  readonly record: unknown
  /** The spec's own edits of its draft, as the screen sends them. */
  readonly edit: { readonly type: string }
  /** What the spec reads when the screen opens (an idea's lists), passed to its edits. */
  readonly context: unknown
  /** What else Send can still need, besides the required items. */
  readonly need: string
}

type Item<K extends BundleKind> = K["item"]

/** An answer as Send sees it: its take now, and any words typed for it. */
export type BundleAnswer<I extends string = string> = {
  readonly item: I
  /** Its take now: its id and when it was recorded; null for words typed alone. */
  readonly take: { readonly id: string; readonly at: string } | null
  /** Words typed for it: alone, or beside a take kept unheard (ST34). */
  readonly typed: string | null
}

export type BundleSpec<K extends BundleKind> = {
  /** The items, one card each, in order. */
  readonly items: ReadonlyArray<Item<K>>
  /** What a take of `draft`'s answer to `item` answers, as the take is kept and told home. */
  readonly answersOf: (draft: string, item: Item<K>) => string
  /** Whether Send needs `item` answered. */
  readonly required: (item: Item<K>) => boolean
  /** Whether a card offers typing when voice didn't come through. */
  readonly typing: boolean
  /** The longest typed answer. */
  readonly typedMax: number
  /**
   * `draft` with the machine's fields as `answers` has them, and its own as
   * they are: how the machine takes an optional field off a draft it holds
   * as the spec's type (`{ about: draft.about, ...answers }`).
   */
  readonly withAnswers: (
    draft: K["draft"],
    answers: BundleDraft<Item<K>>
  ) => K["draft"]
  /** A new draft, with nothing said. */
  readonly fresh: (id: string, at: string, context: K["context"]) => K["draft"]
  /** `draft` with `edit` made, or `draft` itself when it changes nothing. */
  readonly edit: (
    draft: K["draft"],
    edit: K["edit"],
    context: K["context"]
  ) => K["draft"]
  /**
   * What else Send needs of `draft` at `at`, with `said` items answered,
   * besides the required items; null for nothing.
   */
  readonly missing: (
    draft: K["draft"],
    at: string,
    said: number
  ) => K["need"] | null
  /** Whether a draft kept opens on its cards, rather than on the screen before them. */
  readonly resumesOnCards: (draft: K["draft"]) => boolean
  /** The record Send keeps: the answers, and the items passed over, in order. */
  readonly record: (
    draft: K["draft"],
    answers: ReadonlyArray<BundleAnswer<Item<K>>>,
    passed: ReadonlyArray<Item<K>>,
    at: string
  ) => K["record"]
  /** A record's id: its draft's. */
  readonly idOf: (record: K["record"]) => string
  /** The takes a record names. */
  readonly named: (record: K["record"]) => ReadonlyArray<string>
}

/** How far a person is through a bundle. */
type BundleScreen =
  | "loading"
  /** What is kept on this phone can't be read, so nothing can be kept. */
  | "unreadable"
  /** What comes before the cards: a new idea's about, a week's brief. */
  | "intro"
  | "cards"
  | "review"
  | "sent"

/** A card's own state, besides its take and typed words. */
type CardMode =
  /**
   * Nothing was kept: voice didn't come through for it, or (`full`) the
   * phone holds as many takes as it can until home has them.
   */
  | { readonly kind: "failed"; readonly full: boolean }
  /**
   * Typing instead, because voice didn't work; `beside`, the take kept
   * unheard that the words will stand beside, if they were begun for one.
   */
  | {
      readonly kind: "typing"
      readonly text: string
      readonly beside: string | null
    }

/** A permanent step, asked first. */
type BundleConfirm<I extends string> =
  | { readonly kind: "answer"; readonly item: I }
  | { readonly kind: "all" }

/**
 * Where home is, as far as this phone can tell; `unknown` while the phone
 * hasn't yet read whether it is paired, when a screen says nothing about
 * pairing.
 */
export type HomeReach = "near" | "away" | "unpaired" | "unknown"

/** Whether this phone is known to be paired with home (ST34). */
export function isPaired(reach: HomeReach): boolean {
  return reach === "near" || reach === "away"
}

/** What the screen says once, after something happened. */
export type BundleNotice =
  /** One answer deleted before Send. */
  | "deleted"
  /** The whole draft deleted before Send. */
  | "deletedAll"
  /** A change this phone couldn't keep. */
  | "notKept"
  /** The record couldn't be kept on this phone, so nothing was sent. */
  | "notSent"
  /** The answer couldn't be deleted. */
  | "notDeleted"

export type BundleState<K extends BundleKind> = {
  readonly screen: BundleScreen
  readonly draft: K["draft"]
  /** The takes on the phone's desk of the bundle's takes, as it lists them. */
  readonly takes: ReadonlyArray<PatternTake>
  /** The card on screen, 0 to `items.length - 1`. */
  readonly index: number
  readonly modes: Partial<Readonly<Record<Item<K>, CardMode>>>
  /** A take is under way. */
  readonly busy: boolean
  /** The take being read or playing, if one is. */
  readonly playing: string | null
  /** Play all: the takes still to play after the one playing, in order. */
  readonly playAll: ReadonlyArray<string> | null
  readonly confirm: BundleConfirm<Item<K>> | null
  readonly context: K["context"]
  readonly reach: HomeReach
  readonly notice: BundleNotice | null
  /** The record just sent, or the one a draft opened on was sent as. */
  readonly sent: K["record"] | null
  /** Takes already asked to be dropped (`drop`), so none is asked twice. */
  readonly dropping: ReadonlyArray<string>
  /** When the last event the screen stamped happened, ISO: what `missing` is read at. */
  readonly at: string
}

type Stamp = { readonly at: string }

/** Taps, as a screen sends them, besides the spec's own edits. */
type BundleTap<I extends string = string> =
  | { readonly type: "start" }
  /** To a card, from the cards or from the screen before them. */
  | { readonly type: "go"; readonly index: number }
  | { readonly type: "swipe"; readonly to: "next" | "prev" }
  /** The take button, Try again, Say it instead, Redo: a take, or its stop. */
  | { readonly type: "tap"; readonly item: I }
  /** Plays a take, or stops it when it is the one playing. */
  | { readonly type: "play"; readonly take: string }
  | { readonly type: "playAll" }
  | { readonly type: "askDelete"; readonly item: I }
  | { readonly type: "askDeleteAll" }
  | { readonly type: "confirmed" }
  | { readonly type: "keepIt" }
  | { readonly type: "typeInstead"; readonly item: I }
  | {
      readonly type: "typed"
      readonly item: I
      readonly text: string
    }
  | { readonly type: "keepTyped"; readonly item: I }
  | { readonly type: "later"; readonly item: I }
  | { readonly type: "review" }
  | { readonly type: "change" }
  | { readonly type: "back" }
  | { readonly type: "send" }
  | { readonly type: "another" }
  | { readonly type: "readAgain" }
  /** The person closed what the screen said. */
  | { readonly type: "noticeDismissed" }

/** Taps and the spec's edits, as a screen sends them. */
export type BundleIntent<K extends BundleKind> =
  | BundleTap<Item<K>>
  | { readonly type: "edit"; readonly edit: K["edit"] }

export type BundleEvent<K extends BundleKind> =
  | (Exclude<BundleIntent<K>, { type: "another" }> & Stamp)
  /** With the next draft's id. */
  | ({ readonly type: "another"; readonly id: string } & Stamp)
  | ({ readonly type: "entered" } & Stamp)
  | { readonly type: "left" }
  /** The page hid: the app went to the background, or the screen locked. */
  | { readonly type: "hidden" }
  | {
      readonly type: "opened"
      /** The draft kept, null for none, undefined when unreadable. */
      readonly draft: K["draft"] | null | undefined
      /** The records already kept; null when they can't be read. */
      readonly kept: ReadonlyArray<K["record"]> | null
      readonly takes: ReadonlyArray<PatternTake>
      readonly context: K["context"]
      /** For a new draft, should none be kept. */
      readonly id: string
      readonly at: string
    }
  | { readonly type: "takes"; readonly takes: ReadonlyArray<PatternTake> }
  | { readonly type: "busy"; readonly busy: boolean }
  | { readonly type: "ended"; readonly ended: TakeEnded }
  | { readonly type: "playing"; readonly take: string | null }
  | { readonly type: "reach"; readonly reach: HomeReach }
  | { readonly type: "draftKept"; readonly kept: boolean }
  /** Send's outcome: the record as kept, or null when it couldn't be. */
  | { readonly type: "sentKept"; readonly record: K["record"] | null }
  /** Delete all's outcome, with the next draft's id. */
  | ({
      readonly type: "deletedAll"
      readonly deleted: boolean
      readonly id: string
    } & Stamp)
  /** One answer's delete: false when the store couldn't. */
  | { readonly type: "deleted"; readonly deleted: boolean }

export type BundleEffect<K extends BundleKind> =
  | { readonly type: "open" }
  | { readonly type: "keepDraft"; readonly draft: K["draft"] | null }
  /**
   * D1's tap: starts a take answering `answers`, or stops the one under way.
   * With `draft`, the draft is kept first, and the take starts only if it
   * was (`draftKept`).
   */
  | {
      readonly type: "tap"
      readonly answers: string
      readonly supersedes: string | null
      readonly draft?: K["draft"]
    }
  | { readonly type: "play"; readonly take: string }
  | { readonly type: "stopPlaying" }
  /** Deletes an answer's takes, which never left the phone, for good. */
  | { readonly type: "deleteTakes"; readonly takes: ReadonlyArray<string> }
  /**
   * Deletes, for good and saying nothing, waiting takes nothing will send:
   * replaced by a newer take of their answer, or of a kept record that
   * doesn't name them.
   */
  | { readonly type: "drop"; readonly takes: ReadonlyArray<string> }
  /** Deletes the draft and every take it has, for good. */
  | { readonly type: "deleteAll"; readonly takes: ReadonlyArray<string> }
  /**
   * Keeps `record` with the records kept, then lets `takes` go home, then
   * clears the draft.
   */
  | {
      readonly type: "send"
      readonly record: K["record"]
      readonly takes: ReadonlyArray<string>
    }
  /** Lets the takes records already kept name, still waiting, go home. */
  | { readonly type: "settle"; readonly takes: ReadonlyArray<string> }
  /**
   * The screen went, or the page hid: a take under way is finished and
   * kept, and nothing plays.
   */
  | { readonly type: "leave" }

type BundleStep<K extends BundleKind> = {
  readonly state: BundleState<K>
  readonly effects: ReadonlyArray<BundleEffect<K>>
}

function initialBundle<K extends BundleKind>(
  spec: BundleSpec<K>,
  context: K["context"],
  id: string,
  at: string
): BundleState<K> {
  return {
    screen: "loading",
    draft: spec.fresh(id, at, context),
    takes: [],
    index: 0,
    modes: {},
    busy: false,
    playing: null,
    playAll: null,
    confirm: null,
    context,
    reach: "unknown",
    notice: null,
    sent: null,
    dropping: [],
    at,
  }
}

type Read<K extends BundleKind> = Pick<BundleState<K>, "draft" | "takes">

const same = <K extends BundleKind>(state: BundleState<K>): BundleStep<K> => ({
  state,
  effects: [],
})

/** `record` without `item`'s entry. */
function without<T>(
  record: Partial<Readonly<Record<string, T>>>,
  item: string
): Partial<Readonly<Record<string, T>>> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== item)
  )
}

/** The bundle's machine for one spec: its step, and what a screen reads. */
export function bundleMachine<K extends BundleKind>(
  spec: BundleSpec<K>
): BundleMachine<K> {
  type I = Item<K>
  type D = K["draft"]
  type State = BundleState<K>
  type Step = BundleStep<K>
  type Effect = BundleEffect<K>
  type Event = BundleEvent<K>
  const { items } = spec

  /** `draft` without its optional field `key`. */
  function dropped(draft: D, key: "beside" | "unheard"): D {
    const { id, at, typed, beside, unheard, overtaken, later } = draft
    const answers: BundleDraft<I> = {
      id,
      at,
      typed,
      ...(beside === undefined || key === "beside" ? {} : { beside }),
      ...(unheard === undefined || key === "unheard" ? {} : { unheard }),
      ...(overtaken === undefined ? {} : { overtaken }),
      later,
    }
    return spec.withAnswers(draft, answers)
  }

  /** The item a take answers, when it is one of draft `draft`'s. */
  const itemOf = (draft: string, answers: string): I | null =>
    items.find((item) => spec.answersOf(draft, item) === answers) ?? null

  /** The draft's takes: every one answering one of its items. */
  const draftTakes = (state: Read<K>): ReadonlyArray<PatternTake> =>
    state.takes.filter((take) => itemOf(state.draft.id, take.answers) !== null)

  /** The take that answers `item` now, if one does. */
  function currentTake(state: Read<K>, item: I): PatternTake | null {
    return currentTakeOf(state.takes, spec.answersOf(state.draft.id, item))
  }

  /** Every take answering `item`, whatever its standing. */
  function takesOf(state: Read<K>, item: I): ReadonlyArray<PatternTake> {
    const answers = spec.answersOf(state.draft.id, item)
    return state.takes.filter((take) => take.answers === answers)
  }

  /** The takes the records kept name. */
  const namedBy = (kept: ReadonlyArray<K["record"]>): ReadonlySet<string> =>
    new Set(kept.flatMap((record) => spec.named(record)))

  /**
   * The waiting takes nothing will send, each on the word of what owns its
   * record: the draft's takes each replaced by its answer's take now, and,
   * with `kept`, each kept record's takes it doesn't name. A take whose
   * record neither owns keeps waiting: its draft or record may only have
   * been unreadable. None already asked for.
   */
  function droppable(
    state: Pick<State, "draft" | "takes" | "dropping">,
    kept: ReadonlyArray<K["record"]> | null
  ): ReadonlyArray<string> {
    return state.takes
      .filter((take) => {
        if (take.waits !== true || state.dropping.includes(take.id)) {
          return false
        }
        const item = itemOf(state.draft.id, take.answers)
        if (item !== null) return currentTake(state, item)?.id !== take.id
        const owner = kept?.find(
          (record) => itemOf(spec.idOf(record), take.answers) !== null
        )
        return owner !== undefined && !namedBy([owner]).has(take.id)
      })
      .map((take) => take.id)
  }

  /**
   * The draft with a mark leaving an item for later taken off each item a
   * take answers now. A take kept after the screen went (Say it instead,
   * then leaving) is told no screen, so this is read from the takes, not
   * their ending. Typed words stay: whether a take takes their place is its
   * ending's to say (`takeEnded`); one told no screen is found when the
   * screen opens (`setAside`).
   */
  const answeredBy = (state: Read<K>): D =>
    items.reduce(
      (draft, item) =>
        currentTake(state, item) === null ? draft : withoutLater(draft, item),
      state.draft
    )

  /**
   * The takes listed: what they answer taken off the draft, and kept, and
   * those nothing will send dropped; `opening`, typed words a take kept
   * while the screen was gone answers set aside too (`setAside`).
   */
  function withTakes(
    state: State,
    takes: ReadonlyArray<PatternTake>,
    kept: ReadonlyArray<K["record"]> | null,
    opening = false
  ): Step {
    const listed = { ...state, takes }
    const answers = answeredBy(listed)
    const draft = opening ? setAside({ ...listed, draft: answers }) : answers
    const next = draft === listed.draft ? listed : { ...listed, draft }
    const keep: ReadonlyArray<Effect> =
      draft === listed.draft ? [] : [{ type: "keepDraft", draft }]
    const drop = droppable(next, kept)
    return drop.length === 0
      ? { state: next, effects: keep }
      : {
          state: { ...next, dropping: [...next.dropping, ...drop] },
          effects: [...keep, { type: "drop", takes: drop }],
        }
  }

  /** How an item stands: said, typed, or neither yet. */
  function answered(state: Read<K>, item: I): Answered {
    if (typedBeside(state, item) !== null) return "typed"
    if (currentTake(state, item) !== null) return "said"
    return state.draft.typed[item] === undefined ? null : "typed"
  }

  /**
   * The words typed beside `item`'s take, when they stand beside the take
   * that answers it now (one kept unheard, ST34); null otherwise.
   */
  function typedBeside(state: Read<K>, item: I): string | null {
    const take = state.draft.beside?.[item]
    const typed = state.draft.typed[item]
    return take !== undefined &&
      typed !== undefined &&
      currentTake(state, item)?.id === take
      ? typed
      : null
  }

  /** What Send still needs: the spec's own first, then a required answer. */
  function missing(state: Pick<State, "draft" | "takes" | "at">): Missing<K> {
    const own = spec.missing(state.draft, state.at, answeredCount(state))
    if (own !== null) return own
    const first = items.find(
      (item) => spec.required(item) && answered(state, item) === null
    )
    return first === undefined ? null : "required"
  }

  /** How many items are answered, said or typed. */
  const answeredCount = (state: Read<K>): number =>
    items.filter((item) => answered(state, item) !== null).length

  /**
   * The record a draft sends: each answer said (its one take) or typed, and
   * the items with neither passed over.
   */
  function bundleRecord(state: Read<K>, at: string): K["record"] {
    const answers = items.flatMap((item): ReadonlyArray<BundleAnswer<I>> => {
      const current = currentTake(state, item)
      if (current !== null) {
        const take = { id: current.id, at: current.recordedAt }
        // Words typed beside a take kept unheard go with it (ST34).
        return [{ item, take, typed: typedBeside(state, item) }]
      }
      const typed = state.draft.typed[item]
      return typed === undefined ? [] : [{ item, take: null, typed }]
    })
    const said = new Set(answers.map((answer) => answer.item))
    const passed = items.filter((item) => !said.has(item))
    return spec.record(state.draft, answers, passed, at)
  }

  /** The draft changed, and kept. */
  const withDraft = (state: State, draft: D): Step => ({
    state: { ...state, draft, notice: null },
    effects: [{ type: "keepDraft", draft }],
  })

  const withoutLater = (draft: D, item: I): D =>
    draft.later.includes(item)
      ? { ...draft, later: draft.later.filter((each) => each !== item) }
      : draft

  function withoutTyped(draft: D, item: I): D {
    if (draft.typed[item] === undefined) return draft
    const beside =
      draft.beside === undefined ? undefined : without(draft.beside, item)
    return {
      ...withBeside(dropped(draft, "beside"), beside),
      typed: without(draft.typed, item),
    }
  }

  /** The draft with `item`'s take marked kept unheard (ST34), or not. */
  function withUnheard(draft: D, item: I, take: string | null): D {
    if ((draft.unheard?.[item] ?? null) === take) return draft
    const rest = dropped(draft, "unheard")
    const others =
      draft.unheard === undefined ? {} : without(draft.unheard, item)
    const next = take === null ? others : { ...others, [item]: take }
    return Object.keys(next).length === 0 ? rest : { ...rest, unheard: next }
  }

  /**
   * The draft with the typed words a take kept while the screen was gone
   * answers in place of set aside (`overtaken`): a take answers their item
   * that they don't stand beside. The screen saw every other take end, so
   * only one kept after it went can be such a take.
   */
  const setAside = (state: Read<K>): D =>
    items.reduce((draft, item) => {
      const typed = draft.typed[item]
      const current = currentTake(state, item)
      if (
        typed === undefined ||
        current === null ||
        draft.beside?.[item] === current.id
      ) {
        return draft
      }
      const earlier = draft.overtaken?.[item] ?? []
      return {
        ...withoutTyped(draft, item),
        overtaken: { ...draft.overtaken, [item]: [...earlier, typed] },
      }
    }, state.draft)

  /** The draft with `item`'s typed words, if any, beside `take`. */
  function besideTake(draft: D, item: I, take: string): D {
    if (draft.typed[item] === undefined) return draft
    if (draft.beside?.[item] === take) return draft
    return { ...draft, beside: { ...draft.beside, [item]: take } }
  }

  /** `draft` with `beside`, absent when it names no take. */
  const withBeside = (
    draft: D,
    beside: BundleDraft["beside"] | undefined
  ): D =>
    beside === undefined || Object.keys(beside).length === 0
      ? draft
      : { ...draft, beside }

  function withMode(state: State, item: I, mode: CardMode | null): State {
    const modes = without(state.modes, item)
    return {
      ...state,
      modes: mode === null ? modes : { ...modes, [item]: mode },
    }
  }

  /** Stops Play all, and what plays, before something else happens. */
  function hushed(state: State): Step {
    if (state.playAll === null && state.playing === null) return same(state)
    return {
      state: { ...state, playAll: null },
      effects: state.playing === null ? [] : [{ type: "stopPlaying" }],
    }
  }

  function then(first: Step, next: (state: State) => Step): Step {
    const second = next(first.state)
    return {
      state: second.state,
      effects: [...first.effects, ...second.effects],
    }
  }

  /** The card at `index`, within the items. */
  const clamp = (index: number): number =>
    Math.max(0, Math.min(items.length - 1, index))

  /** A tap on an item's take button, or one of the cards' ways to say it. */
  function tapped(state: State, item: I): Step {
    const answers = spec.answersOf(state.draft.id, item)
    // The take under way, wherever it is, is stopped by its own button only.
    if (state.busy) {
      return {
        state,
        effects: [{ type: "tap", answers, supersedes: null }],
      }
    }
    const current = currentTake(state, item)
    const draft = withoutLater(state.draft, item)
    const cleared = withMode(
      { ...state, playAll: null, confirm: null, notice: null, draft },
      item,
      null
    )
    return {
      state: { ...cleared, index: items.indexOf(item), screen: "cards" },
      // The draft is kept first, so the take is named by a draft this phone
      // holds; one it couldn't keep starts no take.
      effects: [
        { type: "tap", answers, supersedes: current?.id ?? null, draft },
      ],
    }
  }

  /** A take ended: a kept one answers its card; one voice lost says so. */
  function takeEnded(state: State, ended: TakeEnded): Step {
    const item = itemOf(state.draft.id, ended.answers)
    if (item === null) return same(state)
    switch (ended.ending) {
      case "kept": {
        const later = withoutLater(state.draft, item)
        const draft = !ended.unheard
          ? // Heard: the take answers, in place of any typed words.
            withUnheard(withoutTyped(later, item), item, null)
          : ended.id === null
            ? later
            : // Kept with no voice heard in it: the take stays, marked so its
              // card offers typing beside it, and any words typed for the
              // item stand beside it now (ST34).
              besideTake(withUnheard(later, item, ended.id), item, ended.id)
        const next = withMode(state, item, null)
        return draft === state.draft ? same(next) : withDraft(next, draft)
      }
      case "blocked":
      case "failed":
      case "full": {
        // A card that has its take keeps it; the pattern says how this one ended.
        if (currentTake(state, item) !== null) return same(state)
        return same(
          withMode(state, item, {
            kind: "failed",
            full: ended.ending === "full",
          })
        )
      }
      case "short":
      case "early": {
        return same(state)
      }
      default: {
        return assertNever(ended.ending)
      }
    }
  }

  function onTap(
    state: State,
    event: Exclude<BundleTap<I>, { type: "another" }> & Stamp
  ): Step {
    const { draft } = state
    switch (event.type) {
      case "start": {
        return state.screen === "intro"
          ? same({ ...state, screen: "cards", notice: null })
          : same(state)
      }
      case "go": {
        if (state.screen === "intro") {
          return same({
            ...state,
            screen: "cards",
            index: clamp(event.index),
            notice: null,
          })
        }
        return state.screen === "cards"
          ? then(hushed(state), (quiet) =>
              same({ ...quiet, index: clamp(event.index) })
            )
          : same(state)
      }
      case "swipe": {
        if (state.screen !== "cards") return same(state)
        const index = clamp(state.index + (event.to === "next" ? 1 : -1))
        return index === state.index
          ? same(state)
          : then(hushed(state), (quiet) => same({ ...quiet, index }))
      }
      case "tap": {
        if (state.screen !== "cards" && state.screen !== "review") {
          return same(state)
        }
        return tapped(state, event.item)
      }
      case "play": {
        if (state.busy) return same(state)
        return {
          state: { ...state, playAll: null, notice: null },
          effects: [{ type: "play", take: event.take }],
        }
      }
      case "playAll": {
        if (state.playAll !== null) return hushed(state)
        const queue = items.flatMap((item) => {
          const take = currentTake(state, item)
          return take === null ? [] : [take.id]
        })
        const [first, ...rest] = queue
        if (first === undefined) return same(state)
        // A take already playing stops first; its end starts the queue, from
        // the first answer.
        if (state.playing !== null) {
          return {
            state: { ...state, playAll: queue, notice: null },
            effects: [{ type: "stopPlaying" }],
          }
        }
        return {
          state: { ...state, playAll: rest, notice: null },
          effects: [{ type: "play", take: first }],
        }
      }
      case "askDelete": {
        if (answered(state, event.item) === null) return same(state)
        return then(hushed(state), (quiet) =>
          same({ ...quiet, confirm: { kind: "answer", item: event.item } })
        )
      }
      case "askDeleteAll": {
        return then(hushed(state), (quiet) =>
          same({ ...quiet, confirm: { kind: "all" } })
        )
      }
      case "keepIt": {
        return same({ ...state, confirm: null })
      }
      case "confirmed": {
        const { confirm } = state
        if (confirm === null) return same(state)
        if (confirm.kind === "all") {
          return {
            state: { ...state, confirm: null },
            effects: [
              {
                type: "deleteAll",
                takes: draftTakes(state).map((take) => take.id),
              },
            ],
          }
        }
        const { item } = confirm
        const closed = { ...state, confirm: null }
        if (currentTake(state, item) !== null) {
          const deleteTakes = {
            type: "deleteTakes",
            takes: takesOf(state, item).map((take) => take.id),
          } as const
          // Words typed beside its take go with the answer (ST34).
          const typed = withUnheard(withoutTyped(draft, item), item, null)
          return typed === draft
            ? { state: closed, effects: [deleteTakes] }
            : {
                state: { ...closed, draft: typed },
                effects: [{ type: "keepDraft", draft: typed }, deleteTakes],
              }
        }
        const typed = withoutTyped(draft, item)
        return typed === draft
          ? same(closed)
          : {
              state: { ...closed, draft: typed, notice: "deleted" },
              effects: [{ type: "keepDraft", draft: typed }],
            }
      }
      case "typeInstead": {
        if (!spec.typing) return same(state)
        const failed = state.modes[event.item]?.kind === "failed"
        // The take kept unheard, as its ending named it, not the take list,
        // which may not show it yet.
        const beside = draft.unheard?.[event.item] ?? null
        if (!failed && beside === null) return same(state)
        return same(
          withMode(state, event.item, {
            kind: "typing",
            text: "",
            beside: failed ? null : beside,
          })
        )
      }
      case "typed": {
        const mode = state.modes[event.item]
        return mode?.kind === "typing"
          ? same(
              withMode(state, event.item, {
                ...mode,
                text: event.text.slice(0, spec.typedMax),
              })
            )
          : same(state)
      }
      case "keepTyped": {
        const mode = state.modes[event.item]
        if (mode?.kind !== "typing") return same(state)
        const text = mode.text.trim()
        if (text === "") return same(state)
        const kept = withoutTyped(withoutLater(draft, event.item), event.item)
        // Beside the take kept unheard only while it is still the item's
        // last take kept.
        const beside =
          mode.beside !== null && draft.unheard?.[event.item] === mode.beside
            ? { ...kept.beside, [event.item]: mode.beside }
            : kept.beside
        return withDraft(withMode(state, event.item, null), {
          ...withBeside(kept, beside),
          typed: { ...kept.typed, [event.item]: text },
        })
      }
      case "later": {
        const index = items.indexOf(event.item)
        const next = withMode(
          { ...state, index: clamp(index + 1) },
          event.item,
          null
        )
        return draft.later.includes(event.item)
          ? same(next)
          : withDraft(next, { ...draft, later: [...draft.later, event.item] })
      }
      case "review": {
        return state.screen === "cards" || state.screen === "intro"
          ? then(hushed(state), (quiet) =>
              same({ ...quiet, screen: "review", notice: null })
            )
          : same(state)
      }
      case "change": {
        return state.screen === "review"
          ? then(hushed(state), (quiet) =>
              same({ ...quiet, screen: "intro", notice: null })
            )
          : same(state)
      }
      case "back": {
        const to: BundleScreen | null =
          state.screen === "cards"
            ? "intro"
            : state.screen === "review"
              ? "cards"
              : null
        return to === null
          ? same(state)
          : then(hushed(state), (quiet) =>
              same({ ...quiet, screen: to, notice: null })
            )
      }
      case "send": {
        if (state.screen !== "review" || missing(state) !== null) {
          return same(state)
        }
        return then(hushed(state), (quiet) => {
          const record = bundleRecord(quiet, event.at)
          return {
            state: quiet,
            effects: [{ type: "send", record, takes: [...namedBy([record])] }],
          }
        })
      }
      case "readAgain": {
        return state.screen === "unreadable"
          ? {
              state: { ...state, screen: "loading" },
              effects: [{ type: "open" }],
            }
          : same(state)
      }
      case "noticeDismissed": {
        return same({ ...state, notice: null })
      }
      default: {
        return assertNever(event)
      }
    }
  }

  /** The machine's step. */
  function stepBundle(state: State, event: Event): Step {
    // Nothing moves, and nothing is deleted or sent, while a take is under way.
    if (state.busy && MOVES.has(event.type)) return same(state)
    const at = "at" in event ? event.at : state.at
    const stamped = at === state.at ? state : { ...state, at }
    const next = step(stamped, event)
    // A step that changes nothing keeps the state as it was, unless the time
    // changes what Send still needs (a deadline passing).
    if (next.state !== stamped || next.effects.length > 0) return next
    const said = answeredCount(state)
    return spec.missing(state.draft, at, said) ===
      spec.missing(state.draft, state.at, said)
      ? same(state)
      : same(stamped)
  }

  function step(state: State, event: Event): Step {
    switch (event.type) {
      case "entered": {
        return {
          state: { ...state, screen: "loading" },
          effects: [{ type: "open" }],
        }
      }
      case "left":
      case "hidden": {
        return {
          state: { ...state, playAll: null },
          effects: [{ type: "leave" }],
        }
      }
      case "opened": {
        if (state.screen !== "loading") return same(state)
        const { context, draft, kept } = event
        if (draft === undefined || kept === null) {
          return same({ ...state, screen: "unreadable", context })
        }
        // A take a kept record names that still waits, waits on a Send that
        // kept the record and couldn't let it go: it goes now.
        const named = namedBy(kept)
        const waiting = event.takes
          .filter((take) => take.waits === true && named.has(take.id))
          .map((take) => take.id)
        const settle: ReadonlyArray<Effect> =
          waiting.length === 0 ? [] : [{ type: "settle", takes: waiting }]
        const fresh = spec.fresh(event.id, event.at, context)
        // Sent before the screen could clear it, the draft goes.
        const sent =
          draft !== null &&
          kept.some((record) => spec.idOf(record) === draft.id)
        const resumed = draft === null || sent ? null : draft
        // A fresh draft already sent opens on what was sent.
        const done =
          resumed === null
            ? (kept.find((record) => spec.idOf(record) === fresh.id) ?? null)
            : null
        const opened: State = {
          ...state,
          context,
          draft: resumed ?? fresh,
          sent: done,
          screen:
            done !== null
              ? "sent"
              : resumed !== null && spec.resumesOnCards(resumed)
                ? "cards"
                : "intro",
        }
        return then(withTakes(opened, event.takes, kept, true), (listed) => ({
          state: listed,
          effects: [
            ...settle,
            ...(sent ? [{ type: "keepDraft" as const, draft: null }] : []),
          ],
        }))
      }
      case "takes": {
        return withTakes(state, event.takes, null)
      }
      case "busy": {
        return event.busy === state.busy
          ? same(state)
          : same({ ...state, busy: event.busy })
      }
      case "ended": {
        return takeEnded(state, event.ended)
      }
      case "playing": {
        if (event.take === state.playing) return same(state)
        const next = { ...state, playing: event.take }
        // Play all: the take that played ended, so the next one plays.
        if (event.take === null && state.playAll !== null) {
          const [first, ...rest] = state.playAll
          return first === undefined
            ? same({ ...next, playAll: null })
            : {
                state: { ...next, playAll: rest },
                effects: [{ type: "play", take: first }],
              }
        }
        return same(next)
      }
      case "reach": {
        return same({ ...state, reach: event.reach })
      }
      case "draftKept": {
        return event.kept ? same(state) : same({ ...state, notice: "notKept" })
      }
      case "sentKept": {
        if (event.record === null) {
          return same({ ...state, notice: "notSent" })
        }
        return same({
          ...state,
          screen: "sent",
          sent: event.record,
          modes: {},
          index: 0,
          notice: null,
        })
      }
      case "deletedAll": {
        if (!event.deleted) return same({ ...state, notice: "notDeleted" })
        return same({
          ...state,
          draft: spec.fresh(event.id, event.at, state.context),
          screen: "intro",
          modes: {},
          index: 0,
          notice: "deletedAll",
        })
      }
      case "deleted": {
        return same({
          ...state,
          notice: event.deleted ? "deleted" : "notDeleted",
        })
      }
      case "another": {
        if (state.screen !== "sent") return same(state)
        const draft = spec.fresh(event.id, event.at, state.context)
        // A draft named as the record just sent would answer what was sent.
        if (state.sent !== null && spec.idOf(state.sent) === draft.id) {
          return same(state)
        }
        return same({
          ...state,
          draft,
          screen: "intro",
          sent: null,
          notice: null,
        })
      }
      case "edit": {
        const draft = spec.edit(state.draft, event.edit, state.context)
        return draft === state.draft ? same(state) : withDraft(state, draft)
      }
      case "start":
      case "go":
      case "swipe":
      case "tap":
      case "play":
      case "playAll":
      case "askDelete":
      case "askDeleteAll":
      case "confirmed":
      case "keepIt":
      case "typeInstead":
      case "typed":
      case "keepTyped":
      case "later":
      case "review":
      case "change":
      case "back":
      case "send":
      case "readAgain":
      case "noticeDismissed": {
        return onTap(state, event)
      }
      default: {
        return assertNever(event)
      }
    }
  }

  function cardView(state: State, item: I, recording: boolean): CardView {
    if (recording) return { kind: "take" }
    const mode = state.modes[item]
    if (mode?.kind === "typing") return { kind: "typing", text: mode.text }
    if (mode !== undefined) return mode
    const beside = typedBeside(state, item)
    if (beside !== null) return { kind: "typed", words: beside }
    const current = currentTake(state, item)
    if (current !== null) {
      return spec.typing && state.draft.unheard?.[item] === current.id
        ? { kind: "unheard" }
        : { kind: "take" }
    }
    const typed = state.draft.typed[item]
    if (typed !== undefined) return { kind: "typed", words: typed }
    return state.draft.later.includes(item)
      ? { kind: "later" }
      : { kind: "take" }
  }

  return {
    spec,
    stepBundle,
    initial: (context: K["context"], id: string, at: string): State =>
      initialBundle(spec, context, id, at),
    answered,
    answeredCount,
    canPlayAll: (state: Read<K>): boolean =>
      items.some((item) => currentTake(state, item) !== null),
    standsBeside: (state: Read<K>, item: I): boolean =>
      typedBeside(state, item) !== null,
    missing,
    bundleRecord,
    cardView,
    answersOf: (state: Pick<State, "draft">, item: I): string =>
      spec.answersOf(state.draft.id, item),
  }
}

/** A bundle's machine for one spec: its step, and what a screen reads of a state. */
export type BundleMachine<K extends BundleKind> = {
  readonly spec: BundleSpec<K>
  readonly stepBundle: (
    state: BundleState<K>,
    event: BundleEvent<K>
  ) => BundleStep<K>
  readonly initial: (
    context: K["context"],
    id: string,
    at: string
  ) => BundleState<K>
  readonly answered: (state: Read<K>, item: K["item"]) => Answered
  /** How many items are answered, said or typed. */
  readonly answeredCount: (state: Read<K>) => number
  /** Whether a play-through has a take to play: any answer's take now. */
  readonly canPlayAll: (state: Read<K>) => boolean
  /**
   * Whether `item`'s answer is words typed beside the take that answers it
   * now (one kept unheard, ST34): deleting the answer deletes both.
   */
  readonly standsBeside: (state: Read<K>, item: K["item"]) => boolean
  /** What Send still needs. */
  readonly missing: (
    state: Pick<BundleState<K>, "draft" | "takes" | "at">
  ) => Missing<K>
  /** The record a draft sends at `at`. */
  readonly bundleRecord: (state: Read<K>, at: string) => K["record"]
  /** What a card shows; `recording`, its take is under way. */
  readonly cardView: (
    state: BundleState<K>,
    item: K["item"],
    recording: boolean
  ) => CardView
  /** What a take of `state`'s draft's answer to `item` answers. */
  readonly answersOf: (
    state: Pick<BundleState<K>, "draft">,
    item: K["item"]
  ) => string
}

/** What Send still needs: the spec's own, or a required answer; null for nothing. */
type Missing<K extends BundleKind> = K["need"] | "required" | null

/** How an item stands: said, typed, or neither yet. */
export type Answered = "said" | "typed" | null

const MOVES: ReadonlySet<BundleEvent<BundleKind>["type"]> = new Set([
  "go",
  "swipe",
  "review",
  "change",
  "back",
  "start",
  "send",
  "askDeleteAll",
  "another",
  "playAll",
])

/** Where a card is: its take under way, a block of its own, or its take. */
export type CardView =
  | { readonly kind: "failed"; readonly full: boolean }
  /** Its take, kept with no voice heard, and typing offered beside it (ST34). */
  | { readonly kind: "unheard" }
  | { readonly kind: "typing"; readonly text: string }
  | { readonly kind: "typed"; readonly words: string }
  | { readonly kind: "later" }
  /** The take pattern's item: its button and its take, if it has one. */
  | { readonly kind: "take" }
