/**
 * What each of Studio's takes was said for (TAKES2, #3068), as Takes reads
 * it (`@some-ui/soundbites`' `LibraryAbout`): `./model`'s join over the
 * stores the phone keeps. The notes are read as they are; the ideas and the
 * videos (this phone's stores, which the route hands in, `AboutStores`),
 * and the spoken cards' titles (`lib/studio-spoken`), each time a screen
 * opens, since neither tells of a change; the open asks
 * (GitHub's public list, as Studio's Asks reads it) once a page load. Each
 * screen is told when a read lands, and a read overtaken by a newer one is
 * dropped. A read that fails leaves the take saying what its ref says.
 * Phone-only (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { LibraryAbout } from "@some-ui/soundbites"

import type { Note } from "@/lib/episode-feedback"
import { episodeFeedback } from "@/lib/episode-feedback"
import { readStudioAsks } from "@/lib/studio-asks/read"
import { spokenStore } from "@/lib/studio-spoken/store"
import { titleOf } from "@/lib/studio-spoken/words"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { AboutSources, KnownIdea, KnownVideo } from "./model"
import { aboutOf, NO_SOURCES } from "./model"

/**
 * This phone's ideas and videos, as Studio keeps them (soundbites'
 * `keptIdeaStore` and `phoneProjectStore`), handed in by the route, which
 * alone may import Studio's package (`build.paths.ts`, the apk audience).
 */
export type AboutStores = {
  readonly ideas: () => ReadonlyArray<{
    readonly id: string
    readonly about?: { readonly title: string } | undefined
    readonly asked?:
      | ReadonlyArray<{ readonly id: string; readonly words: string }>
      | undefined
  }>
  readonly videos: () => Promise<
    ReadonlyArray<{
      readonly id: string
      readonly revisions: ReadonlyArray<{
        readonly cutList: {
          readonly title: string
          readonly shots: ReadonlyArray<{ readonly id: string }>
        }
      }>
    }>
  >
}

type Read = Omit<AboutSources, "notes">

let read: Read = NO_SOURCES
let asked = false
/** The latest read of the videos; an answer to an earlier one is dropped. */
let videoReads = 0
let snapshot: readonly [Read, ReadonlyArray<Note>] | null = null
const listeners = new Set<() => void>()

const told = (change: Partial<Read>): void => {
  read = { ...read, ...change }
  for (const listener of listeners) listener()
}

function ideasOf(
  ideas: ReturnType<AboutStores["ideas"]>
): ReadonlyMap<string, KnownIdea> {
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

function videosOf(
  projects: Awaited<ReturnType<AboutStores["videos"]>>
): ReadonlyMap<string, KnownVideo> {
  const videos = new Map<string, KnownVideo>()
  for (const project of projects) {
    const { cutList } = project.revisions.at(-1) ?? {}
    if (cutList === undefined) continue
    videos.set(project.id, {
      title: cutList.title,
      scenes: cutList.shots.map(({ id }) => id),
    })
  }
  return videos
}

/** Reads the ideas and the videos again, and the asks once a page load. */
function opened(stores: AboutStores): void {
  told({
    ideas: ideasOf(stores.ideas()),
    spoken: new Map(
      spokenStore(browserLocalStorage)
        .read()
        .map((card) => [card.id, titleOf(card)])
    ),
  })
  videoReads += 1
  const mine = videoReads
  stores
    .videos()
    .then((projects) => {
      if (mine === videoReads) told({ videos: videosOf(projects) })
    })
    .catch((error: unknown) => {
      reportFailure({ port: "takes' videos", error: toIntentError(error) })
    })
  if (asked) return
  asked = true
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

/** What each take was said for, as Takes asks it, over `stores`. */
export const takeAbout = (stores: AboutStores): LibraryAbout => ({
  subscribe(listener): () => void {
    opened(stores)
    listeners.add(listener)
    const notes = episodeFeedback.subscribe(listener)
    return (): void => {
      listeners.delete(listener)
      notes()
    }
  },
  getSnapshot(): readonly [Read, ReadonlyArray<Note>] {
    const notes = episodeFeedback.getSnapshot()
    if (snapshot?.[0] !== read || snapshot[1] !== notes) {
      snapshot = [read, notes]
    }
    return snapshot
  },
  about: (id, ref) =>
    aboutOf(id, ref, { ...read, notes: episodeFeedback.getSnapshot() }),
})

/** The note `take` is the spoken part of, while this phone keeps it. */
export const noteOfTake = (take: string): Note | null =>
  episodeFeedback.getSnapshot().find((note) => note.take === take) ?? null
