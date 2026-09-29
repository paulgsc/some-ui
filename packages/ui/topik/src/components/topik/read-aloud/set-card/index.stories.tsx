import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import {
  addRep,
  addSet,
  emptyRecord,
} from "@topik/lib/topik/read-aloud/records"

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

/** A week of practice: counts only, never a rate (Prop. 6.4 (iii)). */
const WEEK = [1, 2, 3, 5, 6, 7].reduce(
  (record, day) =>
    addSet(
      addRep(
        addRep(record, `2026-09-2${day}`, 9000 + day * 500),
        `2026-09-2${day}`,
        7000
      ),
      `2026-09-2${day}`
    ),
  emptyRecord()
)

/** With the practice record kept on the device. */
export const ReadyWithRecord: Story = {
  args: {
    kind: "ready",
    level: 2,
    audio: true,
    resuming: false,
    record: { record: WEEK, today: "2026-09-27" },
    short: false,
    onStart: noop,
    onStop: noop,
  },
}

/** The same, on a phone held sideways: the start screen scrolls. */
export const LandscapeReadyWithRecord: Story = {
  args: {
    kind: "ready",
    level: 2,
    audio: true,
    resuming: true,
    record: { record: WEEK, today: "2026-09-27" },
    short: true,
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
