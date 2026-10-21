/**
 * The read-aloud drill as the handheld applet offers it: the session from
 * `read-aloud-session`, with what it keeps between sittings loaded and saved
 * on the device (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6,
 * Rem. 4.10, Rem. 7.5), and beside it on the same start screen the
 * grammar-lens session (`lens-session`, Cor. 4.8), a start of its own.
 *
 * The deck is every added set as one (`added-sets`), or one added set on
 * its own. A set offers its own practice only: a lens set opens on the
 * grammar lens, and a read-aloud set offers no lens. Every set as one
 * offers both, the lens asking about `lensDeck`'s lines. The drill's level
 * is the one the host passes: the level held on the material list, or the
 * set's own, capped at the drill's highest (TOPIK 3), since that is where
 * its vocabulary stops.
 *
 * Opening it prunes no pace: a word the deck drawn from does not name may be
 * another set's, or one not added again yet (`added-sets`, `wordsLeaving`).
 */

import type { JSX } from "react"
import { useState } from "react"
import type { Speaker } from "@some-ui/speech"
import { LensSession } from "@topik/components/topik/read-aloud/lens-session"
import { ReadAloudSession } from "@topik/components/topik/read-aloud/read-aloud-session"
import type { LensRecordStore } from "@topik/lib/topik/adapter/lens-record-store"
import type { LensTakes } from "@topik/lib/topik/adapter/lens-takes"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { readAloudLevelFor } from "@topik/lib/topik/read-aloud/content"
import { toggled } from "@topik/lib/topik/read-aloud/feedback"
import { lensLines } from "@topik/lib/topik/read-aloud/lens/items"
import { dayKey } from "@topik/lib/topik/read-aloud/records"
import { drawnFrom } from "@topik/lib/topik/read-aloud/set-builder"

type ReadAloudScreenProps = {
  /** The TOPIK level held on the material list, one to six. */
  topikLevel: number
  speech: Speaker | null
  store?: ReadAloudStore
  /** Where the grammar lens's record is kept; absent, nothing is (Rem. 4.18). */
  lensRecord?: LensRecordStore
  /** The learner's takes in the grammar lens (Rem. 4.16); absent, none. */
  lensTakes?: LensTakes
  deck: ReadAloudDeck
  /** What the grammar lens asks about; `deck` when absent. */
  lensDeck?: ReadAloudDeck
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
  lensRecord,
  lensTakes,
  deck,
  lensDeck = deck,
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
    const kept = store.progress(level, deck.id)
    return {
      store,
      paces: store.paces(),
      resume:
        kept &&
        drawnFrom(
          kept.queue.map((entry) => entry.item),
          deck,
          level
        )
          ? kept
          : null,
      record: store.record(),
      feedback: store.feedback(),
    }
  })
  const [record, setRecord] = useState(loaded.record)
  const [feedback, setFeedback] = useState({
    value: loaded.feedback,
    kept: true,
  })
  const { store } = loaded
  const [practice, setPractice] = useState<"read-aloud" | "lens">("read-aloud")

  if (practice === "lens" || deck.practice === "lens") {
    return (
      <LensSession
        deck={lensDeck}
        level={level}
        speech={speech}
        short={short}
        paused={paused}
        now={now}
        record={lensRecord?.add}
        recordFull={lensRecord?.full}
        takes={lensTakes}
        {...(deck.practice === "lens"
          ? { onExit, exitLabel: "Stop the grammar lens" }
          : { onExit: () => setPractice("read-aloud") })}
      />
    )
  }

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
      feedback={{
        ...feedback,
        onToggle: (key) => {
          const next = toggled(
            feedback.value,
            key,
            new Date(now()).toISOString()
          )
          const kept = store.saveFeedback(next)
          // What the phone holds is what the buttons show.
          setFeedback({ value: kept ? next : store.feedback(), kept })
        },
      }}
      lens={
        deck.practice === "read-aloud"
          ? undefined
          : {
              available: lensLines(lensDeck, level).length > 0,
              full: lensRecord?.full() ?? false,
              onStart: () => setPractice("lens"),
            }
      }
      onExit={onExit}
    />
  )
}
