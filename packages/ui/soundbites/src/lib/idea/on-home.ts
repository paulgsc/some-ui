/**
 * Ideas on home, and the lists they pick from (ST26 (c), #2453): what home
 * holds of the ideas sent whole (paulgsc/server `GET /ideas`), grouped by
 * subject, format, date or keyword and sorted by date or title, one idea at
 * a time with home's words for each answer, and the topics and keywords
 * every new idea picks from, edited as the owner's own lists. One state
 * machine: `stepOnHome(state, event)` returns the next state and the
 * effects to run and does nothing else; `./on-home-runtime` runs them
 * against home and the ideas kept on this phone, and the component renders
 * a state and turns taps into events.
 *
 * Rules that hold by structure:
 *
 * - **A read answers only the read asked for.** Reads are numbered, and a
 *   late answer to an earlier one changes nothing.
 * - **One write at a time.** A furnishing mark, setting an idea aside or a
 *   list's change waits on home's answer (`writing`), and the screen offers
 *   no other write until it lands. What home answered is what shows: the
 *   mark as it now stands, the lists as they now stand.
 * - **Setting an idea aside asks first.** Home keeps it set aside, every
 *   revision with it: a mark, never a delete (paulgsc/server invariant 32).
 * - **An answer said again waits on this phone** (#2579, `./redo`): "Say it
 *   again" records on a desk of its own, and only "Send it again" keeps the
 *   idea grown (one write, like the others) and lets the new takes go home,
 *   the takes they replace set aside there. A waiting take a newer one
 *   replaced is deleted for good once the desk lists both (`dropping`
 *   asks once), and a send cut short is finished after each read. Once
 *   the idea is set aside on home, its answers still waiting go home set
 *   aside with it, kept (#2805).
 * - **Grouping and sorting are the phone's** (paulgsc/server#645): home
 *   lists newest begun first, and `groupsOf` does the rest.
 */
import { assertNever, dayOf } from "@some-ui/core-utils"
import type { PatternTake } from "@some-ui/voice-capture"

import type { Idea, IdeaFormat } from "./model"
import { withWords } from "./model"
import { overtaken, waitingRedos } from "./redo"

/** What home heard in a said answer's note. */
type HomeHeard = {
  readonly text: string
  readonly heardAt: string
}

/** One answer of an idea on home. */
export type HomeAnswer = {
  readonly question: string
  /** The voice note that answers it, by the phone's id; null when typed. */
  readonly note: string | null
  readonly typed: string | null
  /** Null until home has heard the note, and for a typed or set-aside one. */
  readonly heard: HomeHeard | null
  /** The owner let the note go after the idea was sent. */
  readonly setAside: boolean
  /**
   * When the owner deleted the note's recording for good from My data
   * (#2579); null or absent while it is kept, and from a home older than
   * paulgsc/server's delete of an idea's answer.
   */
  readonly deletedAt?: string | null | undefined
}

/** An idea as home holds it: its latest send and its marks. */
export type HomeIdea = {
  readonly id: string
  readonly createdAt: string
  readonly revision: number
  readonly sentAt: string
  readonly title: string
  readonly topic: string
  readonly format: IdeaFormat
  readonly keywords: ReadonlyArray<string>
  readonly questions: number
  readonly answers: ReadonlyArray<HomeAnswer>
  readonly furnishing: boolean
  readonly setAside: boolean
}

/** The topics and keywords home keeps for every new idea. */
export type HomeLists = {
  readonly topics: ReadonlyArray<string>
  readonly keywords: ReadonlyArray<string>
}

/** How a read of home went. */
export type HomeRead<T> =
  | { readonly kind: "read"; readonly value: T }
  /** This phone isn't paired with home: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** Home didn't answer. */
  | { readonly kind: "away" }
  /** Home answered, but keeps no ideas yet: it runs an older version. */
  | { readonly kind: "older" }
  /** Home answered with something this phone can't read. */
  | { readonly kind: "unreadable" }

/** How a write to home went: what home now holds, or why not. */
export type HomeWrite<T> =
  | { readonly kind: "written"; readonly value: T }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  /** Home didn't take it. */
  | { readonly kind: "refused" }

export const GROUP_BY = ["topic", "format", "date", "keyword"] as const
export type GroupBy = (typeof GROUP_BY)[number]

export const SORT_BY = ["newest", "oldest", "title"] as const
export type SortBy = (typeof SORT_BY)[number]

export type ListName = "topics" | "keywords"

/** One group of ideas: its name (`null` for ideas with no keyword). */
export type IdeaGroup = {
  readonly key: string | null
  readonly ideas: ReadonlyArray<HomeIdea>
}

/** The day on this phone's calendar an idea was begun, as `YYYY-MM-DD`. */
export const dayBegun = (idea: HomeIdea): string =>
  dayOf(new Date(idea.createdAt))

function sorted(
  ideas: ReadonlyArray<HomeIdea>,
  sortBy: SortBy
): Array<HomeIdea> {
  const byDate = (a: HomeIdea, b: HomeIdea): number =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  switch (sortBy) {
    case "newest": {
      return [...ideas].sort((a, b) => byDate(b, a))
    }
    case "oldest": {
      return [...ideas].sort(byDate)
    }
    case "title": {
      return [...ideas].sort(
        (a, b) => a.title.localeCompare(b.title) || byDate(b, a)
      )
    }
    default: {
      return assertNever(sortBy)
    }
  }
}

function keysOf(
  idea: HomeIdea,
  groupBy: GroupBy
): ReadonlyArray<string | null> {
  switch (groupBy) {
    case "topic": {
      return [idea.topic]
    }
    case "format": {
      return [idea.format]
    }
    case "date": {
      return [dayBegun(idea)]
    }
    case "keyword": {
      return idea.keywords.length === 0 ? [null] : idea.keywords
    }
    default: {
      return assertNever(groupBy)
    }
  }
}

/**
 * `ideas` in groups, each sorted by `sortBy`: the groups in the order their
 * first idea comes, newest days first when grouped by date. An idea with
 * several keywords is in each of their groups.
 */
export function groupsOf(
  ideas: ReadonlyArray<HomeIdea>,
  groupBy: GroupBy,
  sortBy: SortBy
): ReadonlyArray<IdeaGroup> {
  const groups = new Map<string | null, Array<HomeIdea>>()
  for (const idea of sorted(ideas, groupBy === "date" ? "newest" : sortBy)) {
    for (const key of keysOf(idea, groupBy)) {
      groups.set(key, [...(groups.get(key) ?? []), idea])
    }
  }
  return [...groups].map(([key, grouped]) => ({
    key,
    ideas: groupBy === "date" ? sorted(grouped, sortBy) : grouped,
  }))
}

/**
 * The ideas kept on this phone with home's words added to each said answer
 * that has none yet: the words home heard in that answer's take now, as
 * heard. Only adds, so the ideas still grow; null when nothing is new.
 */
export function withHomeWords(
  ideas: ReadonlyArray<Idea>,
  home: ReadonlyArray<HomeIdea>
): ReadonlyArray<Idea> | null {
  const byId = new Map(home.map((each) => [each.id, each]))
  const next = ideas.map((idea) => {
    const held = byId.get(idea.id)
    if (held === undefined) return idea
    return idea.answers.reduce((growing, answer) => {
      const newest = answer.takes?.at(-1)
      const take = newest?.take
      const heard = held.answers.find(
        (each) => each.note !== null && each.note === take
      )?.heard
      if (
        newest === undefined ||
        take === undefined ||
        // Words typed or fixed since its take now was said stand. Words heard
        // in an earlier take never do, however late home heard them: an
        // answer said again (#2579) still hears its new take's. So a take
        // home hears again (a new `heardAt`) adds its newer words after the
        // first, which only grows the answer.
        answer.versions.some(
          (version) =>
            version.how !== "heard" &&
            Date.parse(version.at) >= Date.parse(newest.at)
        ) ||
        heard === null ||
        heard === undefined ||
        heard.text.trim() === "" ||
        // Heard once already, whatever the two clocks say.
        answer.versions.some((version) => version.at === heard.heardAt)
      ) {
        return growing
      }
      return withWords(growing, answer.question, [
        { at: heard.heardAt, how: "heard", words: heard.text },
      ])
    }, idea)
  })
  return next.some((idea, i) => idea !== ideas[i]) ? next : null
}

type OnHomeScreen =
  | { readonly kind: "list" }
  | { readonly kind: "idea"; readonly id: string }
  | { readonly kind: "lists" }

/** What the screen says once, after a write. */
export type OnHomeNotice =
  | "furnishing"
  | "ready"
  | "setAside"
  | "added"
  | "removed"
  | "notWritten"
  | "away"
  /** The idea was sent again with its answers said again (#2579). */
  | "sentAgain"
  /** It was kept, but its new takes didn't all start home: next time. */
  | "sentAgainPartly"
  /** This phone couldn't keep it, so nothing changed. */
  | "notSentAgain"

/** How sending an idea again went, as the runtime tells the machine. */
export type SentAgain = "sent" | "partly" | "unkept"

/** What the ideas kept on this phone say of their said answers (#2579). */
type PhoneIdeas = {
  /** By idea, the questions this phone can say again (`./redo`'s `sayable`). */
  readonly sayable: Readonly<Record<string, ReadonlyArray<string>>>
  /**
   * Every take a kept idea names (`./redo`'s `namedTakes`): the idea's
   * record, never a draft, even while one still waits to go home after a
   * send again cut short.
   */
  readonly named: ReadonlyArray<string>
  /** By idea and question, the take its answer is now (`latestTakes`). */
  readonly latest: Readonly<Record<string, Readonly<Record<string, string>>>>
}

/** Answers said again on this phone (#2579): what the machine holds of them. */
type RedoState = {
  /** What the ideas kept on this phone say; null until they are read. */
  readonly phone: PhoneIdeas | null
  /** The takes on the desk of answers said again, as last listed. */
  readonly takes: ReadonlyArray<PatternTake>
  /** Waiting takes already asked to be deleted, so none is asked twice. */
  readonly dropping: ReadonlyArray<string>
}

/**
 * The desk's waiting takes that are drafts: those no kept idea names. Null
 * while the kept ideas aren't read, when none can be told from a record.
 */
function drafts(redo: RedoState): ReadonlyArray<PatternTake> | null {
  const { phone } = redo
  if (phone === null) return null
  const named = new Set(phone.named)
  return redo.takes.filter((take) => !named.has(take.id))
}

/**
 * The drafts a newer one overtook, not asked for yet: deleted for good. A
 * take a kept idea names is never one (Codex P1 on #2804).
 */
function dropsOf(redo: RedoState): ReadonlyArray<string> {
  const listed = drafts(redo)
  if (listed === null) return []
  return overtaken(listed).filter((id) => !redo.dropping.includes(id))
}

/** `state` with `redo`, asking to delete any draft it newly finds overtaken. */
function withRedo(state: OnHomeState, redo: RedoState): OnHomeStep {
  const drop = dropsOf(redo)
  return {
    state: {
      ...state,
      redo: { ...redo, dropping: [...redo.dropping, ...drop] },
    },
    effects: drop.length === 0 ? [] : [{ type: "dropRedos", takes: drop }],
  }
}

/** The notes home says were deleted for good from My data. */
function deletedNotes(ideas: ReadonlyArray<HomeIdea>): ReadonlyArray<string> {
  return ideas.flatMap((idea) =>
    idea.answers.flatMap((answer) =>
      answer.note !== null && typeof answer.deletedAt === "string"
        ? [answer.note]
        : []
    )
  )
}

type Reading<T> = { readonly kind: "reading" } | HomeRead<T>

export type OnHomeState = {
  readonly screen: OnHomeScreen
  readonly ideas: Reading<{
    readonly ideas: ReadonlyArray<HomeIdea>
    readonly more: boolean
  }>
  readonly lists: Reading<HomeLists>
  readonly groupBy: GroupBy
  readonly sortBy: SortBy
  /** A write is waiting on home's answer. */
  readonly writing: boolean
  /** Setting this idea aside, asked first. */
  readonly confirm: string | null
  readonly notice: OnHomeNotice | null
  /** The latest read asked for; an answer to an earlier one is stale. */
  readonly seq: number
  readonly redo: RedoState
}

export type OnHomeIntent =
  | { readonly type: "groupBy"; readonly groupBy: GroupBy }
  | { readonly type: "sortBy"; readonly sortBy: SortBy }
  | { readonly type: "open"; readonly id: string }
  | { readonly type: "openLists" }
  | { readonly type: "back" }
  | { readonly type: "readAgain" }
  | { readonly type: "furnish"; readonly furnishing: boolean }
  | { readonly type: "askSetAside" }
  | { readonly type: "confirmed" }
  | { readonly type: "keepIt" }
  /** Sends the open idea again, with the answers said again (#2579). */
  | { readonly type: "sendAgain" }
  /** The person closed what the screen said. */
  | { readonly type: "noticeDismissed" }
  | {
      readonly type: "entry"
      readonly list: ListName
      readonly name: string
      readonly listed: boolean
    }

export type OnHomeEvent =
  | OnHomeIntent
  | { readonly type: "entered"; readonly lists: boolean }
  | {
      readonly type: "ideasRead"
      readonly seq: number
      readonly read: HomeRead<{
        readonly ideas: ReadonlyArray<HomeIdea>
        readonly more: boolean
      }>
    }
  | {
      readonly type: "listsRead"
      readonly seq: number
      readonly read: HomeRead<HomeLists>
    }
  | {
      readonly type: "furnished"
      readonly id: string
      readonly write: HomeWrite<boolean>
    }
  | {
      readonly type: "setAsideDone"
      readonly id: string
      readonly write: HomeWrite<null>
    }
  | {
      readonly type: "entryDone"
      readonly listed: boolean
      readonly write: HomeWrite<HomeLists>
    }
  /** The desk of answers said again listed its takes. */
  | { readonly type: "redoTakes"; readonly takes: ReadonlyArray<PatternTake> }
  /** The ideas on this phone were read: which answers it can say again. */
  | {
      readonly type: "phoneRead"
      readonly phone: PhoneIdeas
    }
  | { readonly type: "sentAgain"; readonly outcome: SentAgain }

export type OnHomeEffect =
  | { readonly type: "readIdeas"; readonly seq: number }
  | { readonly type: "readLists"; readonly seq: number }
  | {
      readonly type: "furnish"
      readonly id: string
      readonly furnishing: boolean
    }
  | { readonly type: "setAside"; readonly id: string }
  | {
      readonly type: "entry"
      readonly list: ListName
      readonly name: string
      readonly listed: boolean
    }
  /** Home's words for said answers, added to the ideas on this phone. */
  | { readonly type: "fill"; readonly ideas: ReadonlyArray<HomeIdea> }
  /**
   * Finishes a send again cut short, then reads which answers this phone
   * can say again (`phoneRead`). `deleted`: notes home deleted for good,
   * which are never set aside.
   */
  | { readonly type: "settleRedos"; readonly deleted: ReadonlyArray<string> }
  /** Deletes these waiting takes for good: nothing will send them. */
  | { readonly type: "dropRedos"; readonly takes: ReadonlyArray<string> }
  /**
   * The answers said again of an idea just set aside on home, which nothing
   * can send again now (#2805): each set aside, then let go home, kept.
   */
  | { readonly type: "setAsideRedos"; readonly takes: ReadonlyArray<string> }
  /** Keeps idea `id` sent again, then sets aside and lets go its takes. */
  | {
      readonly type: "sendAgain"
      readonly id: string
      readonly deleted: ReadonlyArray<string>
    }

export type OnHomeStep = {
  readonly state: OnHomeState
  readonly effects: ReadonlyArray<OnHomeEffect>
}

export const INITIAL_ON_HOME: OnHomeState = {
  screen: { kind: "list" },
  ideas: { kind: "reading" },
  lists: { kind: "reading" },
  groupBy: "topic",
  sortBy: "newest",
  writing: false,
  confirm: null,
  notice: null,
  seq: 0,
  redo: { phone: null, takes: [], dropping: [] },
}

/**
 * The desk's takes the screen shows as said again and not sent yet: the
 * drafts, never a take a kept idea names (Codex P1 on #2804).
 */
export function draftRedos(state: OnHomeState): ReadonlyArray<PatternTake> {
  return drafts(state.redo) ?? []
}

/** The redos of the open idea waiting on this phone to be sent again. */
export function openRedos(state: OnHomeState): ReturnType<typeof waitingRedos> {
  const idea = openIdea(state)
  return idea === null ? [] : waitingRedos(draftRedos(state), idea.id)
}

/** Whether this phone can say `question` of idea `id` again. */
export function canSayAgain(
  state: OnHomeState,
  id: string,
  question: string
): boolean {
  return state.redo.phone?.sayable[id]?.includes(question) === true
}

/**
 * The take this phone last sent as idea `id`'s answer to `question`, while
 * home's last read names another (Codex P2 on #2804): the idea sent again
 * hasn't reached home yet, and the screen shows the phone's answer until
 * it has. Null when home's answer is the phone's.
 */
export function sentAgainTake(
  state: OnHomeState,
  id: string,
  question: string
): string | null {
  const latest = state.redo.phone?.latest[id]?.[question]
  const { ideas } = state
  if (latest === undefined || ideas.kind !== "read") return null
  const home = ideas.value.ideas
    .find((idea) => idea.id === id)
    ?.answers.find((answer) => answer.question === question)
  return home === undefined || home.note === null || home.note === latest
    ? null
    : latest
}

const SENT_AGAIN: Readonly<Record<SentAgain, OnHomeNotice>> = {
  sent: "sentAgain",
  partly: "sentAgainPartly",
  unkept: "notSentAgain",
}

const same = (state: OnHomeState): OnHomeStep => ({ state, effects: [] })

/** The idea open on screen, as home last said it. */
export function openIdea(state: OnHomeState): HomeIdea | null {
  const { screen, ideas } = state
  if (screen.kind !== "idea" || ideas.kind !== "read") return null
  return ideas.value.ideas.find((idea) => idea.id === screen.id) ?? null
}

/** A list entry as home takes one: 1 to 40 characters, trimmed, no `/`. */
export function isEntry(name: string): boolean {
  return (
    name.trim() === name &&
    name.length > 0 &&
    [...name].length <= 40 &&
    !name.includes("/") &&
    // eslint-disable-next-line no-control-regex -- a control character is what home refuses
    !/[\u0000-\u001f\u007f]/.test(name)
  )
}

/** Reads both again, under a new number. */
function readAll(state: OnHomeState): OnHomeStep {
  const seq = state.seq + 1
  return {
    state: {
      ...state,
      seq,
      ideas: { kind: "reading" },
      lists: { kind: "reading" },
    },
    effects: [
      { type: "readIdeas", seq },
      { type: "readLists", seq },
    ],
  }
}

/** The notice for a write that didn't go. */
function unwritten(write: { readonly kind: string }): OnHomeNotice {
  return write.kind === "away" ? "away" : "notWritten"
}

export function stepOnHome(state: OnHomeState, event: OnHomeEvent): OnHomeStep {
  switch (event.type) {
    case "entered": {
      return readAll({
        ...state,
        screen: event.lists ? { kind: "lists" } : { kind: "list" },
      })
    }
    case "readAgain": {
      return readAll({ ...state, notice: null })
    }
    case "noticeDismissed": {
      return same({ ...state, notice: null })
    }
    case "ideasRead": {
      if (event.seq !== state.seq) return same(state)
      return {
        state: { ...state, ideas: event.read },
        effects:
          event.read.kind === "read"
            ? [
                { type: "fill", ideas: event.read.value.ideas },
                {
                  type: "settleRedos",
                  deleted: deletedNotes(event.read.value.ideas),
                },
              ]
            : [],
      }
    }
    case "listsRead": {
      if (event.seq !== state.seq) return same(state)
      return same({ ...state, lists: event.read })
    }
    case "groupBy": {
      return same({ ...state, groupBy: event.groupBy })
    }
    case "sortBy": {
      return same({ ...state, sortBy: event.sortBy })
    }
    case "open": {
      return same({
        ...state,
        screen: { kind: "idea", id: event.id },
        notice: null,
      })
    }
    case "openLists": {
      return same({ ...state, screen: { kind: "lists" }, notice: null })
    }
    case "back": {
      return same({
        ...state,
        screen: { kind: "list" },
        confirm: null,
        notice: null,
      })
    }
    case "furnish": {
      const idea = openIdea(state)
      if (idea === null || state.writing) return same(state)
      return {
        state: { ...state, writing: true, notice: null },
        effects: [
          { type: "furnish", id: idea.id, furnishing: event.furnishing },
        ],
      }
    }
    case "furnished": {
      const { write } = event
      if (write.kind !== "written") {
        return same({ ...state, writing: false, notice: unwritten(write) })
      }
      const { ideas } = state
      return same({
        ...state,
        writing: false,
        notice: write.value ? "furnishing" : "ready",
        ideas:
          ideas.kind === "read"
            ? {
                kind: "read",
                value: {
                  ...ideas.value,
                  ideas: ideas.value.ideas.map((idea) =>
                    idea.id === event.id
                      ? { ...idea, furnishing: write.value }
                      : idea
                  ),
                },
              }
            : ideas,
      })
    }
    case "askSetAside": {
      const idea = openIdea(state)
      if (idea === null || state.writing) return same(state)
      return same({ ...state, confirm: idea.id })
    }
    case "keepIt": {
      return same({ ...state, confirm: null })
    }
    case "confirmed": {
      const id = state.confirm
      if (id === null || state.writing) return same(state)
      return {
        state: { ...state, confirm: null, writing: true, notice: null },
        effects: [{ type: "setAside", id }],
      }
    }
    case "setAsideDone": {
      const { write } = event
      if (write.kind !== "written") {
        return same({ ...state, writing: false, notice: unwritten(write) })
      }
      const { ideas } = state
      const stranded = waitingRedos(draftRedos(state), event.id).map(
        (redo) => redo.take
      )
      const effects: ReadonlyArray<OnHomeEffect> =
        stranded.length === 0
          ? []
          : [{ type: "setAsideRedos", takes: stranded }]
      // Home's list leaves an idea set aside out, as this one now is.
      return {
        effects,
        state: {
          ...state,
          writing: false,
          screen: { kind: "list" },
          notice: "setAside",
          ideas:
            ideas.kind === "read"
              ? {
                  kind: "read",
                  value: {
                    ...ideas.value,
                    ideas: ideas.value.ideas.filter(
                      (idea) => idea.id !== event.id
                    ),
                  },
                }
              : ideas,
        },
      }
    }
    case "redoTakes": {
      const listed = new Set(event.takes.map((take) => take.id))
      return withRedo(state, {
        ...state.redo,
        takes: event.takes,
        dropping: state.redo.dropping.filter((id) => listed.has(id)),
      })
    }
    case "phoneRead": {
      return withRedo(state, { ...state.redo, phone: event.phone })
    }
    case "sendAgain": {
      const idea = openIdea(state)
      if (idea === null || state.writing || openRedos(state).length === 0) {
        return same(state)
      }
      return {
        state: { ...state, writing: true, notice: null },
        effects: [
          {
            type: "sendAgain",
            id: idea.id,
            // Every idea home's read shows, as the settle after a read does.
            deleted:
              state.ideas.kind === "read"
                ? deletedNotes(state.ideas.value.ideas)
                : [],
          },
        ],
      }
    }
    case "sentAgain": {
      return same({
        ...state,
        writing: false,
        notice: SENT_AGAIN[event.outcome],
      })
    }
    case "entry": {
      if (state.writing || state.lists.kind !== "read") return same(state)
      if (!isEntry(event.name)) return same(state)
      return {
        state: { ...state, writing: true, notice: null },
        effects: [
          {
            type: "entry",
            list: event.list,
            name: event.name,
            listed: event.listed,
          },
        ],
      }
    }
    case "entryDone": {
      const { write } = event
      if (write.kind !== "written") {
        return same({ ...state, writing: false, notice: unwritten(write) })
      }
      return same({
        ...state,
        writing: false,
        notice: event.listed ? "added" : "removed",
        lists: { kind: "read", value: write.value },
      })
    }
    default: {
      return assertNever(event)
    }
  }
}
