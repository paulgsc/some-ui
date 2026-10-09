/**
 * The handheld's prompt for the learner's own model (canon Cor. 8.2, 8.3),
 * and the level the learner holds.
 *
 * The prompt is the tree prompt, carrying the last drama the learner played
 * to an ending (`adapter/last-drama-store`, canon Rem. 4.14). The level is
 * the learner's to choose; until they do, it is that drama's level. The
 * review never moves it.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import type { LastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import type { TreeRequest } from "@topik/lib/topik/generation"
import { buildTreePrompt, lastDramaText } from "@topik/lib/topik/generation"

export type LessonPrompt = {
  /** The level the learner holds: read-aloud's, and the prompt's default. */
  level: number
  /** The learner moving to another level; a review never does. */
  chooseLevel: (level: number) => void
  /** The tree prompt for this request, with the last drama. */
  prompt: (request: Pick<TreeRequest, "level" | "scene">) => string
  /**
   * The prompt reached the learner - the clipboard took it, or they copied
   * it by hand - so the review's free text it carried is deleted (canon
   * Rem. 7.4). Not before, or a refused clipboard would lose it unsent.
   */
  handedOff: (prompt: string) => void
}

export function useLessonPrompt(store: LastDramaStore): LessonPrompt {
  const last = useSyncExternalStore(store.subscribe, store.get, store.get)
  const [chosenLevel, setChosenLevel] = useState<number | null>(null)

  // Each prompt built, and the free text it carried. A handoff names the
  // prompt it handed off, so it forgets what that prompt carried and nothing
  // else: not text the learner wrote after the prompt was built.
  const carried = useRef(new Map<string, { lessonId: string; next: string }>())

  const prompt = useCallback(
    (request: Pick<TreeRequest, "level" | "scene">): string => {
      const record = store.get()
      const text = buildTreePrompt({
        ...request,
        lastDrama: record ? lastDramaText(record) : undefined,
      })
      const next = record?.review?.next
      if (record && next !== undefined) {
        carried.current.set(text, { lessonId: record.lessonId, next })
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
    chooseLevel: setChosenLevel,
    prompt,
    handedOff,
  }
}
