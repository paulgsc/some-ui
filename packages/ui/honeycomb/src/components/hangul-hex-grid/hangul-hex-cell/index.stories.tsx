import {
  hexPathFor,
  mockCharacter,
  STORY_HEX_WIDTH,
} from "@honeycomb/lib/hangul/story-fixtures"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { HangulHexCell } from "."

// HangulHexCell renders raw SVG (<g>/<path>/<text>), not its own <svg> - it
// expects a parent <svg> with a coordinate system, exactly as the real
// HexGrid provides one cell at a time. This decorator supplies a minimal
// single-cell viewport so every story below is a faithful, isolated render
// of exactly what one board cell looks like.
const CENTER = STORY_HEX_WIDTH / 2 + 20

const meta: Meta<typeof HangulHexCell> = {
  title: "UI/Honeycomb/Hangul/Components/HangulHexCell",
  component: HangulHexCell,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="bg-slate-900 p-4 rounded-xl">
        <svg
          width={STORY_HEX_WIDTH + 40}
          height={STORY_HEX_WIDTH + 40}
          viewBox={`0 0 ${STORY_HEX_WIDTH + 40} ${STORY_HEX_WIDTH + 40}`}
        >
          <Story />
        </svg>
      </div>
    ),
  ],
  args: {
    character: mockCharacter(),
    centerX: CENTER,
    centerY: CENTER,
    cellWidth: STORY_HEX_WIDTH,
    hexPath: hexPathFor(CENTER, CENTER, STORY_HEX_WIDTH),
    opacity: 1,
    timeRemaining: 1,
    showRomanization: true,
    isSolved: false,
    isPlaceholder: false,
    isMissed: false,
  },
} satisfies Meta<typeof HangulHexCell>

export default meta
type Story = StoryObj<typeof meta>

/** Freshly spawned, full time remaining. */
export const Fresh: Story = {}

/** Under 30% time remaining - red urgency glow + tightening ring. */
export const Urgent: Story = {
  args: { timeRemaining: 0.2 },
}

/** Completed and locked into its cell - green ring, checkmark badge, hint hidden. */
export const Solved: Story = {
  args: { isSolved: true, timeRemaining: 1 },
}

/**
 * A not-yet-reached token of a multi-cell word challenge (ADR 0003 §2(a)):
 * masked glyph, hidden QWERTY hint, dashed outline.
 */
export const Placeholder: Story = {
  args: {
    isPlaceholder: true,
    character: mockCharacter({ hangul: "ㅘ", qwertyKey: "hk" }),
  },
}

/**
 * The word ran out of time before the cursor reached this token: the mask
 * comes off, the glyph is struck in red, and the QWERTY key the player needed
 * is shown. The counterpart to `Solved`, in the incorrect register.
 */
export const Missed: Story = {
  args: {
    isMissed: true,
    isPlaceholder: true,
    timeRemaining: 0,
    character: mockCharacter({ hangul: "ㅘ", qwertyKey: "hk" }),
  },
}

/** `showRomanization: false` (post-streak hint-hiding) hides the QWERTY key even on an active cell. */
export const RomanizationHidden: Story = {
  args: { showRomanization: false },
}

/** A composite two-key diphthong (e.g. ㅘ → "hk") - confirms the QWERTY hint doesn't clip. */
export const CompositeKey: Story = {
  args: {
    character: mockCharacter({ hangul: "ㅘ", qwertyKey: "hk" }),
  },
}
