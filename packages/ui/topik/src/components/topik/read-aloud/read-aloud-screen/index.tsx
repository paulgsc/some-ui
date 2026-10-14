/**
 * The read-aloud drill as the handheld applet offers it: the session from
 * `read-aloud-session`, with what it keeps between sittings loaded and saved
 * on the device (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6,
 * Rem. 4.10, Rem. 7.5).
 *
 * The deck is the bundled one with every added set (`added-sets`), or one
 * added set on its own. The drill's level is the one the host passes:
 * the level held on the material list, or the set's own, capped at the
 * drill's highest (TOPIK 3), since that is where its vocabulary stops.
 *
 * Paces are kept for `vocabulary`, every word the phone names, not only the
 * deck drawn from: one set read on its own leaves the others' paces alone.
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
  /** Every word the phone names; defaults to `deck`'s. */
  vocabulary?: ReadonlyArray<string>
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
  vocabulary,
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
    store.prunePaces(vocabulary ?? deck.words.map((word) => word.id))
    return {
      store,
      paces: store.paces(),
      resume: store.progress(level, deck.id),
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
      onProgress={(progress) => store.saveProgress(level, deck.id, progress)}
      lenses={lenses}
      onLenses={(on) => {
        setLenses(on)
        store.saveLenses(on)
      }}
      onExit={onExit}
    />
  )
}
