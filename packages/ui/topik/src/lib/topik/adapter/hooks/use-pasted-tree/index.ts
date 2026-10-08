/**
 * The scene tree pasted this session, and whether it is playing: the drama's
 * side of the handheld's one pasted slot (`adapter/pasted-lesson`). A tree
 * and a conversation lesson share the slot, so starting either replaces the
 * other, and the caller tells this hook when a conversation took it.
 */

import { useCallback, useState } from "react"
import type { DramaPoints } from "@topik/lib/topik/adapter/drama-point"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import type { DramaLesson } from "@topik/lib/topik/core/drama"

export type PastedTree = {
  tree: DramaLesson | null
  playing: boolean
  /** Holds a newly pasted tree and plays it from the start. */
  start: (lesson: DramaLesson) => void
  play: () => void
  leave: () => void
  /** Lets the tree go before the session ends. */
  forget: () => void
  /** A conversation lesson took the slot: the tree and its place are gone. */
  replaced: () => void
}

export function usePastedTree(
  store: PastedLessonStore,
  points: DramaPoints
): PastedTree {
  const [tree, setTree] = useState(() => store.getTree())
  const [playing, setPlaying] = useState(false)

  const replaced = useCallback((): void => {
    points.clear()
    setTree(null)
    setPlaying(false)
  }, [points])

  return {
    tree,
    playing: playing && tree !== null,
    start: useCallback(
      (lesson: DramaLesson): void => {
        store.setTree(lesson)
        // A newly pasted tree starts fresh, whatever an earlier one left.
        points.clear()
        setTree(lesson)
        setPlaying(true)
      },
      [store, points]
    ),
    play: useCallback((): void => setPlaying(true), []),
    leave: useCallback((): void => setPlaying(false), []),
    forget: useCallback((): void => {
      store.clear()
      replaced()
    }, [store, replaced]),
    replaced,
  }
}
