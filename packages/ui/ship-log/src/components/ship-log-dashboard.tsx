import { useCallback, useEffect, useState } from "react"
import { cubeEvents } from "@some-ui/dice-card"
import { ArrowRight, Pause, Play } from "lucide-react"

import { faceOrder, milestones, timeline } from "../data"
import { CheckMark } from "./check-mark"
import { MilestoneDice } from "./milestone-dice"
import { TimelineAccordion } from "./timeline-accordion"

const CYCLE_MS = 5200

export const ShipLogDashboard = (): React.JSX.Element => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(true)

  const select = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  useEffect(() => {
    cubeEvents.emit("rotate:to", { id: 205, face: faceOrder[activeIndex] ?? 0 })
  }, [activeIndex])

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % timeline.length),
      CYCLE_MS
    )
    return () => window.clearInterval(timer)
  }, [playing])

  return (
    <main className="ship-log-shell">
      <div className="ship-aurora" aria-hidden />
      <div className="ship-layout">
        <header className="ship-header">
          <div className="ship-brand">
            <span>
              <CheckMark />
            </span>
            <strong>SHIP / LOG</strong>
            <small>ENGINEERING MILESTONES</small>
          </div>
          <div className="ship-status">
            <i /> SYSTEM OPERATIONAL <span>BUILD #1,205</span>
          </div>
        </header>

        <section className="ship-hero">
          <div className="ship-hero__copy">
            <p className="ship-eyebrow">
              <span>01</span> MILESTONE UNLOCKED
            </p>
            <h1>
              THE BUILD
              <br />
              IS <em>GREEN.</em>
            </h1>
            <p>
              Two years of genuine tech debt, cleared. One green check, and the
              whole engineering emotional rollercoaster logged.
            </p>
            <div className="ship-metrics">
              <div>
                <strong>731</strong>
                <span>DAYS OF DEBT</span>
              </div>
              <div>
                <strong>0</strong>
                <span>RED THIS WEEK</span>
              </div>
              <div>
                <strong>1,204</strong>
                <span>FAILURES SURVIVED</span>
              </div>
            </div>
          </div>
          <div
            className="ship-stage"
            aria-label={`Current milestone: ${milestones[activeIndex]?.title}`}
          >
            <div className="ship-stage__label">
              <span>ROTATING ARCHIVE</span>
              <span>0{activeIndex + 1} / 04</span>
            </div>
            <MilestoneDice milestones={milestones} cycleMs={CYCLE_MS} />
          </div>
        </section>

        <div className="ship-lower">
          <TimelineAccordion
            items={timeline}
            activeIndex={activeIndex}
            onSelect={select}
          />
          <aside className="ship-summary">
            <p>LIVE TELEMETRY</p>
            <strong>
              ALL CHECKS
              <br />
              HAVE PASSED.
            </strong>
            <span>
              Screenshot it. Frame it. Tomorrow someone opens a PR titled “small
              refactor”.
            </span>
            <button type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? <Pause /> : <Play />}{" "}
              {playing ? "PAUSE CYCLE" : "RESUME CYCLE"}
            </button>
          </aside>
        </div>

        <footer>
          <span>MAIN ✓ GREEN</span>
          <span>0 OPEN SEV-1</span>
          <span>−18,402 LINES</span>
          <span>COVERAGE 87%</span>
          <span>DEPLOYS TODAY 14</span>
          <span className="ship-footer__end">
            VIEW LOG <ArrowRight />
          </span>
        </footer>
      </div>
    </main>
  )
}
