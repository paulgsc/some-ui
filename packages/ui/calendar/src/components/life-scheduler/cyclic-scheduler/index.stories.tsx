import { useState } from "react"
import type { RingHit } from "@calendar/components/life-scheduler/ring"
import { useCyclicClock } from "@calendar/hooks/use-cyclic-clock"
import { getNodeData } from "@some-ui/content/data/life-scheduler"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { PopupState } from "."
import { CyclicScheduler } from "."

const meta: Meta<typeof CyclicScheduler> = {
  title: "UI/Calendar/Scheduler/CyclicScheduler",
  component: CyclicScheduler,
  parameters: { layout: "fullscreen" },
  argTypes: {
    popup: { control: false },
  },
}
export default meta

const InteractiveScheduler = () => {
  const [{ outer, inner }] = useCyclicClock()
  const [popup, setPopup] = useState<PopupState | null>(null)

  return (
    <CyclicScheduler
      outer={outer}
      inner={inner}
      popup={popup}
      onClosePopup={() => setPopup(null)}
      onHitNode={(hit: RingHit) => {
        const data = getNodeData(hit.type, outer, hit.index)
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
    popup: null,
    onHitNode: () => {},
    onClosePopup: () => {},
  },
}
