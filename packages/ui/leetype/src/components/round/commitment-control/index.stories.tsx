import type { FC, ReactNode } from "react"
import { useState } from "react"
import type { Commitment, CommitmentOption } from "@leetype/types/commitment"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CommitmentControl } from "."

const meta: Meta<typeof CommitmentControl> = {
  title: "UI/Input/Components/Round/CommitmentControl",
  component: CommitmentControl,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof CommitmentControl>

const OPTIONS: ReadonlyArray<CommitmentOption> = [
  { id: "correct", label: "It's correct" },
  { id: "incorrect", label: "It's wrong" },
]

/** Reachable one-handed at 360px — the story's own frame is the acceptance check for that. */
const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[360px] p-4">{children}</div>
)

const InteractiveDemo: FC = () => {
  const [log, setLog] = useState<Array<string>>([])

  const describe = (commitment: Commitment): string => {
    if (commitment.kind === "abstain") return "abstained"
    const label = OPTIONS.find((option) => option.id === commitment.id)?.label
    return `chose "${label ?? commitment.id}"`
  }

  return (
    <Phone>
      <CommitmentControl
        options={OPTIONS}
        onCommit={(commitment) =>
          setLog((prior) => [...prior, describe(commitment)])
        }
        reveal={
          <div className="rounded-lg border border-border/60 bg-secondary p-3 text-sm text-foreground">
            Revealed. Recorded commitment: {log.at(-1)}
          </div>
        }
      />
    </Phone>
  )
}

/** Before any tap — every option, abstention included, at full weight and size. */
export const Unresolved: Story = {
  render: () => (
    <Phone>
      <CommitmentControl options={OPTIONS} onCommit={() => {}} />
    </Phone>
  ),
}

/** Tap any option, including "Not sure," to see the reveal unlock immediately, with no confirmation step. */
export const Interactive: Story = {
  render: () => <InteractiveDemo />,
}

/** A closed set with three real choices plus the abstention this component always adds itself. */
export const ThreeOptions: Story = {
  render: () => (
    <Phone>
      <CommitmentControl
        options={[
          { id: "growth-a", label: "Θ(n log n)" },
          { id: "growth-b", label: "Θ(n²)" },
          { id: "growth-c", label: "Θ(2ⁿ)" },
        ]}
        onCommit={() => {}}
        reveal={
          <div className="rounded-lg border border-border/60 bg-secondary p-3 text-sm text-foreground">
            Revealed.
          </div>
        }
      />
    </Phone>
  ),
}
