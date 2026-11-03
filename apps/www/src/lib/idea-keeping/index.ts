/**
 * What Studio's idea screens hand the home link (ST26 (b), #2453): the
 * ideas kept on this phone, each sent one as home keeps it. As with
 * `lib/studio-keeping`, `@some-ui/soundbites` is the phone's alone, so only
 * its routes import it: each idea route hands its reading in here
 * (`keepIdeas`), and the voice lane reads it (`lib/home-link/ideas`). Until
 * one has, in this run of the app, the lane carries no idea, and each sent
 * one waits on the phone for the next run after.
 *
 * A new idea's Send is told here too (`ideaSent`), so the lane runs even
 * when no take moved (every answer typed). This module calls nothing of the
 * link and sends nothing. Phone-only (`build.paths.ts`).
 */
import type { IdeaForHome, IdeaStore } from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"

/** What the voice lane needs of the ideas, handed in by an idea route. */
export type IdeaKeeping = {
  /** Each idea sent whole, as home keeps it; null when they can't be read. */
  readonly forHome: () => ReadonlyArray<IdeaForHome> | null
}

const ideas = handedIn<IdeaKeeping>()

/** An idea route hands its reading in; the voice lane then carries ideas. */
export const keepIdeas = ideas.keep

/** The ideas' reading, once a route has handed it in; null until then. */
export const ideaKeeping = ideas.kept

/** Calls `listener` once the ideas' reading is handed in. */
export const onIdeasKept = ideas.onKept

let moves = 0
const listeners = new Set<() => void>()

/**
 * What moves when an idea is sent on this phone, or home comes to hold one
 * (`lib/home-link/ideas`): the voice lane's record listens to it.
 */
export const ideasMoved = {
  getSnapshot: (): number => moves,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  },
}

/** Tells the voice lane the ideas moved. */
export function ideaMoved(): void {
  moves += 1
  for (const listener of listeners) listener()
}

// Handed in is a move too: until then the lane counts no idea, so an idea
// sent on an earlier launch would otherwise wait for some other change.
ideas.onKept(ideaMoved)

/**
 * `store`, telling the voice lane each time it keeps a change: the new
 * idea's Send is the one change its screen makes.
 */
export function sendingStore(store: IdeaStore): IdeaStore {
  return {
    list: store.list,
    keep: (change): ReturnType<IdeaStore["keep"]> => {
      const kept = store.keep(change)
      if (kept !== null) ideaMoved()
      return kept
    },
  }
}
