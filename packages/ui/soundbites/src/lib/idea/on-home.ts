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
 * - **Grouping and sorting are the phone's** (paulgsc/server#645): home
 *   lists newest begun first, and `groupsOf` does the rest.
 */
import { assertNever, dayOf } from "@some-ui/core-utils"

import type { Idea, IdeaFormat } from "./model"
import { withWords } from "./model"

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
      const take = answer.takes?.at(-1)?.take
      const heard = held.answers.find(
        (each) => each.note !== null && each.note === take
      )?.heard
      if (
        take === undefined ||
        answer.versions.length > 0 ||
        heard === null ||
        heard === undefined ||
        heard.text.trim() === ""
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
            ? [{ type: "fill", ideas: event.read.value.ideas }]
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
      // Home's list leaves an idea set aside out, as this one now is.
      return same({
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
