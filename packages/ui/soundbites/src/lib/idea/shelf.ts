/**
 * The idea shelf (STUDIO ST19) as one state machine: every idea kept, newest
 * first, and one idea at a time, moved on one step: shared with Claude, what
 * Claude made of it picked back, Claude's questions answered, made a video,
 * or set aside. `step(state, event)` returns the next state and the effects
 * to run and does nothing else; `shelf-runtime.ts` runs them against the idea
 * store, the project store and the picked file, and the component renders a
 * state and turns taps into events (docs/monorepo-boundaries.md, "Inside a
 * React package").
 *
 * Rules that hold by structure:
 *
 * - **Nothing about an idea is let go.** Every write is an operation the
 *   idea store applies to what it holds (`applyShelf`), and the store keeps
 *   it only if it only adds (`grows`). Set aside is a mark, and Bring it back
 *   is another.
 * - **Where an idea is comes from what is kept.** Its stage (`stageOf`) is
 *   read from the idea and from the videos on the phone that name it
 *   (`videosOf`), never held as a flag of its own, so a video started from
 *   Claude's scenes through Start counts the same.
 * - **A video starts once, from Claude's latest scenes.** Make this a video
 *   creates a project whose first version is that primer, naming the idea,
 *   and the store makes it only where no project has that id. It waits on
 *   the phone's videos being read, and a second tap while one is being made,
 *   or once a video names the idea, does nothing.
 * - **A pick answers only the pick asked for.** Picks are numbered, and a
 *   late read of an earlier one, or one landing after the idea on screen
 *   changed, changes nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Primer } from "@soundbites/lib/journal/primer"
import type { Project } from "@soundbites/lib/project/model"
import { newProject } from "@soundbites/lib/project/model"
import { cutListOf, projectIdFor } from "@soundbites/lib/project/script"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

import type { Idea } from "./model"
import {
  isAside,
  latestDraft,
  openFollowUp,
  stageOf,
  withAside,
  withReply,
} from "./model"
import type { Reply } from "./reply"
import { readReply } from "./reply"

/** A video on the phone that began as an idea. */
export type IdeaVideo = {
  readonly project: string
  readonly idea: string
}

type ShelfScreen =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  /** Every idea; `aside` shows the ones set aside instead. */
  | { readonly kind: "list"; readonly aside: boolean }
  | { readonly kind: "idea"; readonly id: string }
  /** Claude's questions about the idea, asked one per screen (`IdeaCapture`). */
  | { readonly kind: "answering"; readonly id: string }

/** What the shelf says after something happened, in `STUDIO_WORDS.shelf`. */
export type ShelfNotice =
  | "notKept"
  | "notReply"
  | "otherIdea"
  | "wrongReply"
  | "unreadableFile"
  | "replied"
  | "asked"
  | "made"
  | "notMade"
  | "aside"
  | "back"

export type ShelfState = {
  readonly screen: ShelfScreen
  /** The ideas as the store last kept them, oldest first. */
  readonly ideas: ReadonlyArray<Idea>
  /** The videos that began as ideas; null until read, or if they couldn't be. */
  readonly videos: ReadonlyArray<IdeaVideo> | null
  readonly notice: ShelfNotice | null
  /** The idea a video is being made from, until the store answers. */
  readonly making: string | null
  readonly pickSeq: number
}

/** What a write does to the ideas the store holds now. */
export type ShelfOp =
  | { readonly kind: "reply"; readonly idea: string; readonly reply: Reply }
  | { readonly kind: "aside"; readonly idea: string; readonly aside: boolean }

/** Taps, as the component sends them. */
export type ShelfIntent =
  | { readonly type: "opened"; readonly id: string }
  | { readonly type: "back" }
  | { readonly type: "asideShown"; readonly shown: boolean }
  | { readonly type: "replyPicked"; readonly file: Blob }
  | { readonly type: "answerChosen" }
  | { readonly type: "makeChosen" }
  | { readonly type: "asideChosen" }
  | { readonly type: "backChosen" }
  | { readonly type: "readAgain" }

type Stamp = { readonly at: string }

export type ShelfEvent =
  | (ShelfIntent & Stamp)
  | ({ readonly type: "entered" } & Stamp)
  | {
      readonly type: "listed"
      /** Null when the kept ideas couldn't be read. */
      readonly ideas: ReadonlyArray<Idea> | null
    }
  | {
      readonly type: "videosListed"
      /** Null when the phone's videos couldn't be read. */
      readonly videos: ReadonlyArray<IdeaVideo> | null
    }
  | {
      readonly type: "replyRead"
      readonly seq: number
      readonly text: string
      readonly at: string
    }
  | { readonly type: "replyUnreadable"; readonly seq: number }
  | {
      readonly type: "kept"
      /** The ideas as kept, or null when nothing was. */
      readonly ideas: ReadonlyArray<Idea> | null
      /** What it says once kept. */
      readonly notice: ShelfNotice
    }
  | {
      readonly type: "made"
      /** The project made, or null when it wasn't. */
      readonly project: string | null
    }

export type ShelfEffect =
  | { readonly type: "read" }
  | { readonly type: "readVideos" }
  | { readonly type: "readFile"; readonly file: Blob; readonly seq: number }
  | {
      readonly type: "keep"
      readonly op: ShelfOp
      readonly at: string
      readonly notice: ShelfNotice
    }
  /** Make `project` where no project has its id. */
  | { readonly type: "create"; readonly project: Project }

export type ShelfStep = {
  readonly state: ShelfState
  readonly effects: ReadonlyArray<ShelfEffect>
}

export function initialShelfState(): ShelfState {
  return {
    screen: { kind: "loading" },
    ideas: [],
    videos: null,
    notice: null,
    making: null,
    pickSeq: 0,
  }
}

/** The videos in `projects` that began as ideas: each first naming one. */
export function videosOf(
  projects: ReadonlyArray<Project>
): ReadonlyArray<IdeaVideo> {
  return projects.flatMap((project) => {
    const idea = project.revisions.find(
      (revision) => revision.primer?.idea !== undefined
    )?.primer?.idea
    return idea === undefined ? [] : [{ project: project.id, idea }]
  })
}

/** The ideas named by a video, for `stageOf`. */
export function ideasWithVideos(state: ShelfState): ReadonlySet<string> {
  return new Set((state.videos ?? []).map((video) => video.idea))
}

/** The ideas the list shows, newest first: set aside, or not. */
export function shelved(
  state: ShelfState,
  aside: boolean
): ReadonlyArray<Idea> {
  return state.ideas.filter((idea) => isAside(idea) === aside).reverse()
}

/**
 * Whether the owner answered anything since Claude last sent something about
 * `idea`, so Claude hasn't seen it yet.
 */
export function answeredSinceClaude(idea: Idea): boolean {
  const heard = [
    ...(idea.asked ?? []).map((each) => each.at),
    ...(idea.drafts ?? []).map((each) => each.at),
  ].reduce((a, b) => (b > a ? b : a), "")
  return (
    heard !== "" &&
    idea.answers.some((answer) =>
      answer.versions.some((version) => version.at > heard)
    )
  )
}

/** The idea on screen, if the screen shows one the store holds. */
export function ideaOnScreen(state: ShelfState): Idea | null {
  const { screen } = state
  if (screen.kind !== "idea" && screen.kind !== "answering") return null
  return state.ideas.find((idea) => idea.id === screen.id) ?? null
}

/**
 * The ideas with `op` applied, for the store to keep; unchanged when the op
 * names an idea it doesn't hold or adds nothing (a fourth question from
 * Claude, say), which the store then keeps as no change at all.
 */
export function applyShelf(
  ideas: ReadonlyArray<Idea>,
  op: ShelfOp,
  at: string
): ReadonlyArray<Idea> {
  return ideas.map((idea) => {
    if (idea.id !== op.idea) return idea
    return op.kind === "reply"
      ? (withReply(idea, op.reply, at) ?? idea)
      : withAside(idea, op.aside, at)
  })
}

/** The project Claude's latest scenes for `idea` start, made at `at`. */
export function videoFrom(idea: Idea, at: string): Project | null {
  const draft = latestDraft(idea)
  if (draft === null) return null
  const primer: Primer = { ...draft.primer, idea: idea.id }
  return newProject(projectIdFor(primer.title, at), {
    author: "claude",
    message: STUDIO_WORDS.shelf.firstVersion(primer.title),
    at,
    cutList: cutListOf(primer),
    primer,
  }).project
}

const same = (state: ShelfState): ShelfStep => ({ state, effects: [] })

function onIdea(
  state: ShelfState,
  event: ShelfIntent & Stamp,
  idea: Idea
): ShelfStep {
  const keep = (op: ShelfOp, notice: ShelfNotice): ShelfStep => ({
    state: { ...state, notice: null },
    effects: [{ type: "keep", op, at: event.at, notice }],
  })
  switch (event.type) {
    case "back": {
      return same({
        ...state,
        screen: { kind: "list", aside: isAside(idea) },
        notice: null,
      })
    }
    case "replyPicked": {
      const seq = state.pickSeq + 1
      return {
        state: { ...state, pickSeq: seq, notice: null },
        effects: [{ type: "readFile", file: event.file, seq }],
      }
    }
    case "answerChosen": {
      return openFollowUp(idea) === null
        ? same(state)
        : same({
            ...state,
            screen: { kind: "answering", id: idea.id },
            notice: null,
          })
    }
    case "makeChosen": {
      // Until the phone's videos are read, whether one began here is unknown.
      if (
        state.making !== null ||
        state.videos === null ||
        stageOf(idea, ideasWithVideos(state)) !== "fleshed"
      )
        return same(state)
      const project = videoFrom(idea, event.at)
      return project === null
        ? same(state)
        : {
            state: { ...state, making: idea.id, notice: null },
            effects: [{ type: "create", project }],
          }
    }
    case "asideChosen": {
      return isAside(idea)
        ? same(state)
        : keep({ kind: "aside", idea: idea.id, aside: true }, "aside")
    }
    case "backChosen": {
      return isAside(idea)
        ? keep({ kind: "aside", idea: idea.id, aside: false }, "back")
        : same(state)
    }
    case "opened":
    case "asideShown":
    case "readAgain": {
      return same(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

export function step(state: ShelfState, event: ShelfEvent): ShelfStep {
  const { screen } = state
  switch (event.type) {
    case "entered":
    case "readAgain": {
      return {
        state: { ...state, screen: { kind: "loading" }, notice: null },
        effects: [{ type: "read" }, { type: "readVideos" }],
      }
    }
    case "listed": {
      if (event.ideas === null)
        return screen.kind === "loading"
          ? same({ ...state, screen: { kind: "unreadable" } })
          : same({ ...state, notice: "notKept" })
      const ideas = event.ideas
      return same({
        ...state,
        ideas,
        screen:
          screen.kind === "loading" ? { kind: "list", aside: false } : screen,
      })
    }
    case "videosListed": {
      return same({ ...state, videos: event.videos })
    }
    case "opened": {
      if (screen.kind !== "list") return same(state)
      return state.ideas.some((idea) => idea.id === event.id)
        ? same({
            ...state,
            screen: { kind: "idea", id: event.id },
            notice: null,
          })
        : same(state)
    }
    case "asideShown": {
      return screen.kind === "list"
        ? same({
            ...state,
            screen: { kind: "list", aside: event.shown },
            notice: null,
          })
        : same(state)
    }
    case "replyRead": {
      const idea = ideaOnScreen(state)
      if (event.seq !== state.pickSeq || screen.kind !== "idea" || !idea)
        return same(state)
      const reading = readReply(event.text, idea)
      if (!reading.ok) {
        const notice: ShelfNotice =
          reading.why === "notReply"
            ? "notReply"
            : reading.why === "otherIdea"
              ? "otherIdea"
              : "wrongReply"
        return same({ ...state, notice })
      }
      const { reply } = reading
      return {
        state,
        effects: [
          {
            type: "keep",
            op: { kind: "reply", idea: idea.id, reply },
            at: event.at,
            notice: reply.primer === null ? "asked" : "replied",
          },
        ],
      }
    }
    case "replyUnreadable": {
      return event.seq === state.pickSeq && screen.kind === "idea"
        ? same({ ...state, notice: "unreadableFile" })
        : same(state)
    }
    case "kept": {
      if (event.ideas === null) return same({ ...state, notice: "notKept" })
      return same({ ...state, ideas: event.ideas, notice: event.notice })
    }
    case "made": {
      const made = { ...state, making: null }
      return event.project === null
        ? same({ ...made, notice: "notMade" })
        : {
            state: { ...made, notice: "made" },
            effects: [{ type: "readVideos" }],
          }
    }
    case "back": {
      if (screen.kind === "answering") {
        // Claude's questions were answered by another runtime: read again.
        return {
          state: { ...state, screen: { kind: "idea", id: screen.id } },
          effects: [{ type: "read" }],
        }
      }
      if (screen.kind === "list" && screen.aside)
        return same({ ...state, screen: { kind: "list", aside: false } })
      if (screen.kind !== "idea") return same(state)
      break
    }
    case "replyPicked":
    case "answerChosen":
    case "makeChosen":
    case "asideChosen":
    case "backChosen": {
      break
    }
    default: {
      return assertNever(event)
    }
  }
  const idea = ideaOnScreen(state)
  return screen.kind === "idea" && idea !== null
    ? onIdea(state, event, idea)
    : same(state)
}
