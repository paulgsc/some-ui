/**
 * The scene tree pasted this session, and whether it is playing: the
 * handheld's one pasted slot (`adapter/pasted-lesson`), as state. On mount it
 * also deletes what retired stores left on the device
 * (`purgeRetiredLessons`).
 */

import { useCallback, useEffect, useState } from "react"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import { purgeRetiredLessons } from "@topik/lib/topik/adapter/pasted-lesson"
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
}

export function usePastedTree(store: PastedLessonStore): PastedTree {
  const [tree, setTree] = useState(() => store.getTree())
  const [playing, setPlaying] = useState(false)

  // Lessons and places earlier builds kept in `localStorage` go, so a pasted
  // lesson really lasts the session (Rem. 7.4).
  useEffect(() => {
    purgeRetiredLessons()
  }, [])

  return {
    tree,
    playing: playing && tree !== null,
    start: useCallback(
      (lesson: DramaLesson): void => {
        store.setTree(lesson)
        setTree(lesson)
        setPlaying(true)
      },
      [store]
    ),
    play: useCallback((): void => setPlaying(true), []),
    leave: useCallback((): void => setPlaying(false), []),
    forget: useCallback((): void => {
      store.clear()
      setTree(null)
      setPlaying(false)
    }, [store]),
  }
}
