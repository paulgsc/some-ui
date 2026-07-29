import { HANGUL_WORDS } from "@honeycomb/data"
import { mockMissedWord } from "@honeycomb/lib/hangul/story-fixtures"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { VocabDebriefModal } from "."

const apple = HANGUL_WORDS.find((word) => word.id === "apple")
const bridge = HANGUL_WORDS.find((word) => word.id === "bridge")

const meta: Meta<typeof VocabDebriefModal> = {
  title: "UI/Honeycomb/Hangul/Components/VocabDebriefModal",
  component: VocabDebriefModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[46rem] w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Story />
      </div>
    ),
  ],
  args: {
    missed: mockMissedWord(),
    entry: apple,
    onDismiss: () => {},
  },
} satisfies Meta<typeof VocabDebriefModal>

export default meta
type Story = StoryObj<typeof meta>

/** The ordinary case: the player got partway into 사과 before the clock ran out. */
export const PartiallyTyped: Story = {}

/** The clock ran out before a single jamo landed - every slot is a miss. */
export const NothingTyped: Story = {
  args: { missed: mockMissedWord({ cursor: 0 }) },
}

/** One jamo short. The strip is almost all green, which is the point of showing it. */
export const OneJamoShort: Story = {
  args: { missed: mockMissedWord({ cursor: 3 }) },
}

/** A different entry, to show the prose is per-word and not boilerplate. */
export const Homograph: Story = {
  args: {
    missed: mockMissedWord({
      answerGlyphs: ["ㄷ", "ㅏ", "ㄹ", "ㅣ"],
      cursor: 1,
    }),
    entry: bridge,
  },
}

/**
 * A host-supplied word pool whose stimulus id resolved to nothing (or an entry
 * with no `pedagogy`): the reveal still runs off the jamo alone rather than
 * the debrief being skipped.
 */
export const NoSeedEntry: Story = {
  args: { entry: undefined },
}

/** Nothing to debrief - the player finished the word, so this renders nothing. */
export const Inactive: Story = {
  args: { missed: null },
}
