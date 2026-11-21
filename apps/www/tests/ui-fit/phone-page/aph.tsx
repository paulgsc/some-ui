/**
 * aph's screens on the phone page, for `../stays-put.spec.ts`: the logger
 * and History, on the app's own store over this page's `localStorage`,
 * which starts from the seed. The clock is fixed so the checkpoint the
 * logger picks, and the days it offers, are the same on every run.
 *
 * `planted-shift` is not a screen. It is the sweep's self-test: a tap that
 * brings a line up above a button, so a measure that sees no move goes red.
 * `planted-fixed` is its other half: a tap that shortens a page scrolled to
 * its foot, under a button fixed to the window, which a measure that counts
 * the page's scroll on that button sees move.
 */
import type { JSX } from "react"
import { useState } from "react"
import { AphHistory, AphLog } from "@some-ui/aph"
import { Button } from "@some-ui/shared"

/** 7:05 on a Friday, so the logger opens on the 7:00 checkpoint. */
const NOW = new Date(2026, 10, 6, 7, 5)

const PlantedShift = (): JSX.Element => {
  const [said, setSaid] = useState(false)
  return (
    // Inline: this directory is outside www's Tailwind sources
    // (style.context.ts).
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Button onClick={() => setSaid(true)}>Bring a line up</Button>
      {said && <p role="alert">A line that was not there.</p>}
      <Button variant="outline">Planted target</Button>
    </div>
  )
}

const PlantedFixed = (): JSX.Element => {
  const [short, setShort] = useState(false)
  return (
    <div style={{ height: short ? 900 : 1800, position: "relative" }}>
      <Button
        style={{ position: "absolute", bottom: 0 }}
        onClick={() => setShort(true)}
      >
        Shorten the page
      </Button>
      <Button
        variant="outline"
        style={{ position: "fixed", right: 16, bottom: 96 }}
      >
        Fixed target
      </Button>
    </div>
  )
}

export const APH_FIXTURES = {
  "aph-log": (): JSX.Element => <AphLog now={NOW} />,
  "aph-history": (): JSX.Element => <AphHistory now={NOW} />,
  "planted-shift": PlantedShift,
  "planted-fixed": PlantedFixed,
} satisfies Record<string, () => JSX.Element>
