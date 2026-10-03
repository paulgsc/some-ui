import type { Speaker } from "@some-ui/speech"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"

import { ReadAloudSession } from "."

type Story = StoryObj<typeof ReadAloudSession>
type Meta = MetaObj<typeof ReadAloudSession>

const noop = (): void => undefined

/**
 * A voice that says nothing, taking about as long as the item would take to
 * say, so the ladder can be watched running without audio in Storybook.
 */
const silentVoice: Speaker = {
  available: true,
  say: (text, options): Promise<void> => {
    options.onStart?.()
    const syllables = text.match(/[가-힣]/g)?.length ?? 1
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250 + syllables * 280)
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(new DOMException("aborted", "AbortError"))
      })
    })
  },
  stop: noop,
}

const meta: Meta = {
  title: "UI/Chat/Components/Topik/ReadAloud/Session",
  component: ReadAloudSession,
  args: {
    deck: STARTER_DECK,
    level: 1,
    speech: silentVoice,
    short: false,
    onExit: noop,
  },
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

/** Tap Start and watch a set run hands-free, with a silent stand-in voice. */
export const Live: Story = {}

/** Level 3: long sentences at level 3's rate, mixed with words. */
export const LiveLevelThree: Story = { args: { level: 3 } }

/** A phone on its side. */
export const LiveLandscape: Story = { args: { short: true } }
