/**
 * What each of Studio's takes was said for (TAKES2, #3068; epic #3029),
 * joined from what the phone keeps: a note on an episode names its spoken
 * take (`lib/episode-feedback`, `take`), a video names its scenes, an idea
 * its questions, a spoken card its title (#3339). An answer to an ask
 * (recorded before asks left the phone, C1097) says its ask's number.
 * Pure; `./index` reads the stores.
 *
 * A note's take goes home as a plain take (`take:<id>`), so home keeps no
 * link back to its note: the join is the phone's alone, and a phone that
 * no longer holds the note says only that the take was recorded (C420).
 */
import type { TakeAbout } from "@some-ui/soundbites"
import { parseAskId, spokenPartOfLine } from "@some-ui/video-render"

import { FEED_WORDS } from "@/lib/call-videos/words"
import type { Note } from "@/lib/episode-feedback/model"
import { CATEGORY_WORDS } from "@/lib/episode-feedback/words"
import { FEED_FACTS } from "@/lib/studio-index/words"

/** A video on this phone: its title, and its scenes' ids in order. */
export type KnownVideo = {
  readonly title: string
  readonly scenes: ReadonlyArray<string>
}

/** An idea on this phone: its title, and the questions asked back of it. */
export type KnownIdea = {
  readonly title: string | null
  readonly asked: ReadonlyMap<string, string>
}

/** What the phone knows, by what a take's ref names. */
export type AboutSources = {
  readonly notes: ReadonlyArray<Note>
  /** By the video's id. */
  readonly videos: ReadonlyMap<string, KnownVideo>
  /** By the idea's id. */
  readonly ideas: ReadonlyMap<string, KnownIdea>
  /** Each spoken card's title on this phone, by the card's id. */
  readonly spoken: ReadonlyMap<string, string>
}

export const NO_SOURCES: AboutSources = {
  notes: [],
  videos: new Map(),
  ideas: new Map(),
  spoken: new Map(),
}

/**
 * What take `id` (sent home under `ref`, or not yet: null) was said for, as
 * far as `sources` know; null when they know nothing its ref doesn't.
 */
export function aboutOf(
  id: string,
  ref: string | null,
  sources: AboutSources
): TakeAbout | null {
  const note = sources.notes.find((each) => each.take === id)
  if (note !== undefined) {
    return {
      kind: "note",
      feed: FEED_FACTS[note.feed].name,
      episode: FEED_WORDS[note.feed].label(note.episode),
      atMs: note.atMs,
      picks: note.categories.map((category) => CATEGORY_WORDS[category]),
    }
  }
  if (ref === null) return null
  const spoken = spokenPartOfLine(ref)
  if (spoken !== null) {
    return {
      kind: "spoken",
      card: spoken.card,
      title: sources.spoken.get(spoken.card) ?? null,
      part: spoken.part,
    }
  }
  if (ref.startsWith("idea:")) {
    const [, idea = "", question = ""] = ref.split(":")
    const known = sources.ideas.get(idea)
    return {
      kind: "idea",
      idea: known?.title ?? null,
      // An idea's own questions are Studio's words (`aboutOfRef`); one
      // asked back is the idea's.
      question: known?.asked.get(question) ?? null,
    }
  }
  if (ref.startsWith("ask:")) {
    return {
      kind: "ask",
      ask: null,
      number: parseAskId(ref.slice("ask:".length))?.number ?? null,
    }
  }
  const parts = ref.split(":")
  if (parts.length === 3) {
    const [video = "", scene = ""] = parts
    const known = sources.videos.get(video)
    const at = known?.scenes.indexOf(scene) ?? -1
    return {
      kind: "scene",
      video: known?.title ?? null,
      scene: at === -1 ? null : at + 1,
    }
  }
  return null
}
