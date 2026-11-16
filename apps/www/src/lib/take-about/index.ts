/**
 * What each of Studio's takes was said for (TAKES2, #3068), as Takes reads
 * it (`@some-ui/soundbites`' `LibraryAbout`): `./model`'s join over the
 * stores the phone keeps. The notes are read as they are, the ideas each
 * time a screen opens (their store tells of no change), and the videos
 * (this phone's store) and the open asks (GitHub's public list, as Studio's
 * Asks reads it) once, on the first screen that asks; each screen is told
 * when they land. A read that fails leaves the take saying
 * what its ref says. Phone-only (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { LibraryAbout } from "@some-ui/soundbites"
import { keptIdeaStore, phoneProjectStore } from "@some-ui/soundbites"

import type { Note } from "@/lib/episode-feedback"
import { episodeFeedback } from "@/lib/episode-feedback"
import { readStudioAsks } from "@/lib/studio-asks/read"

import type { AboutSources, KnownIdea, KnownVideo } from "./model"
import { aboutOf, NO_SOURCES } from "./model"

type Read = Omit<AboutSources, "notes">

let read: Read = NO_SOURCES
let started = false
let snapshot: readonly [Read, ReadonlyArray<Note>] | null = null
const listeners = new Set<() => void>()

const told = (change: Partial<Read>): void => {
  read = { ...read, ...change }
  for (const listener of listeners) listener()
}

function ideasKept(): ReadonlyMap<string, KnownIdea> {
  const ideas = keptIdeaStore().list() ?? []
  return new Map(
    ideas.map((idea) => [
      idea.id,
      {
        title: idea.about?.title ?? null,
        asked: new Map((idea.asked ?? []).map(({ id, words }) => [id, words])),
      },
    ])
  )
}

/** Reads the ideas, and the videos and asks once a page load. */
function start(): void {
  told({ ideas: ideasKept() })
  if (started) return
  started = true
  phoneProjectStore()
    .list()
    .then((projects) => {
      const videos = new Map<string, KnownVideo>()
      for (const project of projects) {
        const { cutList } = project.revisions.at(-1) ?? {}
        if (cutList === undefined) continue
        videos.set(project.id, {
          title: cutList.title,
          scenes: cutList.shots.map(({ id }) => id),
        })
      }
      told({ videos })
    })
    .catch((error: unknown) => {
      reportFailure({ port: "takes' videos", error: toIntentError(error) })
    })
  readStudioAsks()
    .then((asks) => {
      told({
        asks: new Map(
          asks.map((ask) => [ask.id, ask.ask?.question ?? ask.title])
        ),
      })
    })
    // Ignored: out of reach is ordinary here, and the ask's take says its
    // number instead, as it does for an ask no longer open.
    .catch(() => undefined)
}

const port: LibraryAbout = {
  subscribe(listener) {
    start()
    listeners.add(listener)
    const notes = episodeFeedback.subscribe(listener)
    return (): void => {
      listeners.delete(listener)
      notes()
    }
  },
  getSnapshot() {
    const notes = episodeFeedback.getSnapshot()
    if (snapshot?.[0] !== read || snapshot[1] !== notes) {
      snapshot = [read, notes]
    }
    return snapshot
  },
  about: (id, ref) =>
    aboutOf(id, ref, { ...read, notes: episodeFeedback.getSnapshot() }),
}

/** What each take was said for, as Takes asks it. */
export const takeAbout = (): LibraryAbout => port

/** The note `take` is the spoken part of, while this phone keeps it. */
export const noteOfTake = (take: string): Note | null =>
  episodeFeedback.getSnapshot().find((note) => note.take === take) ?? null
