/**
 * The handheld's prompt for the learner's own model (canon Cor. 8.2, 8.3),
 * and the level the learner holds.
 *
 * The prompt is the tree prompt, carrying the last drama the learner played
 * to an ending (`adapter/last-drama-store`, canon Rem. 4.14). The level is
 * the learner's to choose, kept on the device once chosen (`kept`); until
 * they choose, it is that drama's level.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import type {
  Carried,
  LastDramaStore,
} from "@topik/lib/topik/adapter/last-drama-store"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type { DramaRequest, TopikLevel } from "@topik/lib/topik/generation"
import { buildTreePrompt, lastDramaText } from "@topik/lib/topik/generation"

export type LessonPrompt = {
  /** The level the learner holds: read-aloud's, and the prompt's default. */
  level: number
  /** The learner moving to another level; a review never does. */
  chooseLevel: (level: TopikLevel) => void
  /** The tree prompt for this request, with the last drama. */
  prompt: (request: DramaRequest) => string
  /**
   * The prompt reached the learner - the clipboard took it, or they copied
   * it by hand - so the review's free text it carried is deleted (canon
   * Rem. 7.4). Not before, or a refused clipboard would lose it unsent.
   */
  handedOff: (prompt: string) => void
}

export function useLessonPrompt(
  store: LastDramaStore,
  kept: Pick<ReadAloudStore, "level" | "saveLevel">
): LessonPrompt {
  const last = useSyncExternalStore(store.subscribe, store.get, store.get)
  // Read once: from here the choice is this hook's, and each one is written.
  const [chosenLevel, setChosenLevel] = useState(() => kept.level())
  const chooseLevel = useCallback(
    (level: TopikLevel): void => {
      kept.saveLevel(level)
      setChosenLevel(level)
    },
    [kept]
  )

  // Each prompt built, and the free text it carried. A handoff names the
  // prompt it handed off, so it forgets what that prompt carried and nothing
  // else: not text the learner wrote after the prompt was built.
  const carried = useRef(new Map<string, Carried>())

  const prompt = useCallback(
    (request: DramaRequest): string => {
      const record = store.get()
      const text = buildTreePrompt({
        ...request,
        lastDrama: record ? lastDramaText(record) : undefined,
      })
      const next = record?.review?.next
      if (record && next !== undefined) {
        const { lessonId, content } = record
        carried.current.set(text, { lessonId, content, next })
      }
      return text
    },
    [store]
  )

  const handedOff = useCallback(
    (text: string): void => {
      const free = carried.current.get(text)
      if (!free) return
      carried.current.delete(text)
      store.forgetNext(free)
    },
    [store]
  )

  return {
    level: chosenLevel ?? last?.level ?? 1,
    chooseLevel,
    prompt,
    handedOff,
  }
}
