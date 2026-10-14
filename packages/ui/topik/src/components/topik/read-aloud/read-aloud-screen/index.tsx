/**
 * The read-aloud drill as the handheld applet offers it: the session from
 * `read-aloud-session`, with what it keeps between sittings loaded and saved
 * on the device (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6,
 * Rem. 4.10, Rem. 7.5).
 *
 * The deck is the bundled one: the starter lines and the level-one lines.
 * The drill's level follows the one the learner holds on the material list,
 * capped at the drill's highest (TOPIK 3), since that is where its
 * vocabulary stops.
 */

import type { JSX } from "react"
import { useState } from "react"
import type { Speaker } from "@some-ui/speech"
import { ReadAloudSession } from "@topik/components/topik/read-aloud/read-aloud-session"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { BUNDLED_DECK } from "@topik/lib/topik/read-aloud/bundled"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { readAloudLevelFor } from "@topik/lib/topik/read-aloud/content"
import { dayKey } from "@topik/lib/topik/read-aloud/records"

type ReadAloudScreenProps = {
  /** The TOPIK level held on the material list, one to six. */
  topikLevel: number
  speech: Speaker | null
  store?: ReadAloudStore
  deck?: ReadAloudDeck
  short?: boolean
  /** The host's session is paused (`useReadAloud`'s `paused`). */
  paused?: boolean
  onExit: () => void
  /** Test seam: the clock, which also dates the record. */
  now?: () => number
}

export const ReadAloudScreen = ({
  topikLevel,
  speech,
  store: given,
  deck = BUNDLED_DECK,
  short = false,
  paused,
  onExit,
  now = Date.now,
}: ReadAloudScreenProps): JSX.Element => {
  const level = readAloudLevelFor(topikLevel)
  // Read once: the drill keeps its own copy of the pace book from the first
  // tap, and the unfinished set is only a starting point.
  const [loaded] = useState(() => {
    const store = given ?? createReadAloudStore()
    store.prunePaces(deck.words.map((word) => word.id))
    return {
      store,
      paces: store.paces(),
      resume: store.progress(level),
      record: store.record(),
    }
  })
  const [record, setRecord] = useState(loaded.record)
  const { store } = loaded
  const [lenses, setLenses] = useState(() => store.lenses())

  return (
    <ReadAloudSession
      deck={deck}
      level={level}
      speech={speech}
      paces={loaded.paces}
      resume={loaded.resume}
      now={now}
      record={{ record, today: dayKey(new Date(now())) }}
      short={short}
      paused={paused}
      onRecord={(event, day) => setRecord(store.count(event, day))}
      onPace={(wordId, pace) => store.savePace(wordId, pace)}
      onProgress={(progress) => store.saveProgress(level, progress)}
      lenses={lenses}
      onLenses={(on) => {
        setLenses(on)
        store.saveLenses(on)
      }}
      onExit={onExit}
    />
  )
}
