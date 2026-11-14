/**
 * One take's place on Studio's conveyor (CONVEYOR2, #2874), under its row on
 * the conveyor page: where it stands on the shared station strip (SFEED15,
 * #2901), and a move to each other station the owner may set, with labels
 * and a note riding along. The one place a take is moved, so the one place
 * it is made Ready for pickup. Canned sits beside the line, kept; deleting
 * one for good stays in My data (LA19). Renders `lib/take-conveyor` and
 * hands it each move; what a move did is said over the screen (HS1). It
 * exists only in the Android app (`build.paths.ts`).
 */
import type { JSX } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Input, Label, Notice, StationStrip } from "@some-ui/shared"
import type { LibraryTake } from "@some-ui/soundbites"

import type { TakeStation } from "@/lib/take-conveyor/model"
import {
  homeStationOf,
  labelsOf,
  MOVABLE_STATIONS,
} from "@/lib/take-conveyor/model"
import type { TakeConveyor } from "@/lib/take-conveyor/runtime"
import { TAKE_CONVEYOR_WORDS } from "@/lib/take-conveyor/words"

const WORDS = TAKE_CONVEYOR_WORDS

/** The line a take moves along; Canned sits beside it. */
const LINE = (
  ["in-the-oven", "cooking", "ready-for-pickup", "picked-up"] as const
).map((id) => ({ id, name: WORDS.stations[id] }))

/** What the last move said: where it went, or why it didn't. */
type Said = {
  readonly tone: "neutral" | "warning"
  readonly text: string
}

export const TakeSorting = ({
  take,
  conveyor,
}: {
  take: LibraryTake
  conveyor: TakeConveyor
}): JSX.Element | null => {
  const [labels, setLabels] = useState("")
  const [note, setNote] = useState("")
  const [said, setSaid] = useState<Said | null>(null)
  const standing = conveyor.standing(take.id, homeStationOf(take))

  // Moves are offered only where home names a station: an idea's answer is
  // on no conveyor, and home answers a take it doesn't hold yet as off the
  // conveyor, which would drop a move made on it for good (#2874).
  if (standing === null) return null
  const canned = standing.station === "canned"
  const moves =
    standing.station === "picked-up"
      ? []
      : MOVABLE_STATIONS.filter((station) => station !== standing.station)

  const move = (to: TakeStation): void => {
    const made = conveyor.move({
      take: take.id,
      from: standing.station,
      seq: standing.seq,
      to,
      labels: labelsOf(labels),
      comment: note,
    })
    switch (made.kind) {
      case "moved": {
        setLabels("")
        setNote("")
        setSaid({ tone: "neutral", text: WORDS.page.moved(to) })
        return
      }
      case "refused": {
        setSaid({ tone: "warning", text: WORDS.refused[made.why] })
        return
      }
      case "unkept": {
        setSaid({ tone: "warning", text: WORDS.unkept })
        return
      }
      default: {
        assertNever(made)
      }
    }
  }

  const labelsId = `take-labels-${take.id}`
  const noteId = `take-note-${take.id}`
  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <StationStrip
        label={WORDS.label}
        stations={LINE}
        at={standing.station}
        aside={
          canned
            ? { name: WORDS.stations.canned, line: WORDS.means.canned }
            : null
        }
      />
      <p className="text-muted-foreground text-xs">
        {WORDS.standing(standing)}
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={labelsId}>{WORDS.page.labels}</Label>
        <Input
          id={labelsId}
          placeholder={WORDS.page.labelsHint}
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={noteId}>{WORDS.page.note}</Label>
        <Input
          id={noteId}
          placeholder={WORDS.page.noteHint}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {moves.map((station) => (
          <Button
            key={station}
            type="button"
            size="sm"
            variant={station === "ready-for-pickup" ? "default" : "outline"}
            onClick={() => move(station)}
          >
            {station === "canned" ? WORDS.page.can : WORDS.page.moveTo(station)}
          </Button>
        ))}
      </div>
      {said !== null && (
        <Notice tone={said.tone} onDismiss={() => setSaid(null)}>
          {said.text}
        </Notice>
      )}
    </div>
  )
}
