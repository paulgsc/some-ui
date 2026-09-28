import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SetCard } from "."

type Story = StoryObj<typeof SetCard>
type Meta = MetaObj<typeof SetCard>

const noop = (): void => undefined

const meta: Meta = {
  title: "UI/Chat/Components/Topik/ReadAloud/SetCard",
  component: SetCard,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-svh w-full flex-col">
        <Story />
      </div>
    ),
  ],
}
export default meta

/** Before the first tap: a phone plays no audio until one. */
export const Ready: Story = {
  args: {
    kind: "ready",
    level: 1,
    audio: true,
    resuming: false,
    short: false,
    onStart: noop,
    onStop: noop,
  },
}

/** An unfinished set is waiting from an earlier sitting. */
export const Resuming: Story = {
  args: {
    kind: "ready",
    level: 2,
    audio: true,
    resuming: true,
    short: false,
    onStart: noop,
    onStop: noop,
  },
}

/** No voice on this device: the drill is not offered (Cor. 4.6). */
export const NoVoice: Story = {
  args: {
    kind: "ready",
    level: 1,
    audio: false,
    resuming: false,
    short: false,
    onStart: noop,
    onStop: noop,
  },
}

/** Between sets: the count, and a countdown to the next. */
export const Summary: Story = {
  args: {
    kind: "summary",
    counted: 10,
    runKey: 1,
    short: false,
    onNext: noop,
    onStop: noop,
  },
}

/** Thirty minutes in: nothing new begins (Rem. 4.10). */
export const SittingOver: Story = {
  args: { kind: "sitting-over", short: false, onContinue: noop, onStop: noop },
}

/** A phone on its side. */
export const LandscapeReady: Story = {
  args: {
    kind: "ready",
    level: 3,
    audio: true,
    resuming: false,
    short: true,
    onStart: noop,
    onStop: noop,
  },
}
