import { useEffect, useRef, useState } from "react"
import type { RingHit } from "@calendar/components/life-scheduler/ring"
import { getNodeData } from "@some-ui/content/data/life-scheduler"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { PopupState } from "."
import { CyclicScheduler } from "."

const meta: Meta<typeof CyclicScheduler> = {
  title: "UI/Calendar/Scheduler/CyclicScheduler",
  component: CyclicScheduler,
  parameters: { layout: "fullscreen" },
  // Important: tell storybook not to try and render complex objects in controls
  argTypes: {
    popup: { control: false },
  },
}

export default meta

const InteractiveScheduler = () => {
  const [state, setState] = useState({
    outer: 0,
    inner: 0,
    running: true,
    speed: 10,
  })
  const [popup, setPopup] = useState<PopupState | null>(null)

  // Use refs for the simulation loop to prevent closure staleness
  const stateRef = useRef(state)
  stateRef.current = state
  const lastTick = useRef(performance.now())
  const accumulator = useRef(0)

  useEffect(() => {
    let frameId: number

    const loop = (now: number) => {
      const dt = now - lastTick.current
      lastTick.current = now

      if (stateRef.current.running) {
        accumulator.current += dt
        const threshold = 1000 / stateRef.current.speed

        if (accumulator.current >= threshold) {
          accumulator.current -= threshold

          setState((prev) => {
            const nextInner = (prev.inner + 1) % 60
            const nextOuter =
              nextInner === 0 ? (prev.outer + 1) % 24 : prev.outer
            return { ...prev, inner: nextInner, outer: nextOuter }
          })
        }
      }
      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <CyclicScheduler
      {...state}
      popup={popup}
      onToggleRunning={() => setState((s) => ({ ...s, running: !s.running }))}
      onSpeedChange={(speed) => setState((s) => ({ ...s, speed }))}
      onClosePopup={() => setPopup(null)}
      onHitNode={(hit: RingHit) => {
        // Logic remains decoupled from view
        const data = getNodeData(hit.type, stateRef.current.outer, hit.index)
        setPopup({ type: hit.type, index: hit.index, data })
      }}
    />
  )
}

export const Default: StoryObj<typeof CyclicScheduler> = {
  render: () => <InteractiveScheduler />,
}

export const StaticPaused: StoryObj<typeof CyclicScheduler> = {
  args: {
    outer: 12,
    inner: 45,
    running: false,
    speed: 5,
    popup: null,
    onToggleRunning: () => {},
    onSpeedChange: () => {},
    onHitNode: () => {},
    onClosePopup: () => {},
  },
}
