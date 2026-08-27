import { Leetype } from "@leetype/components/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta: Meta<typeof Leetype> = {
  title: "UI/Input/Components/Leetype",
  component: Leetype,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof Leetype>

/**
 * How every host mounts it: no props, no picker, no configuration step. The
 * surface follows the viewport — resize the preview past 768px and the
 * activity switches from the reading probe to the typing one, because on a
 * phone there is no keyboard to produce a witness with.
 */
export const Auto: Story = {
  render: () => (
    <div className="relative h-screen w-full">
      <Leetype sessionSeed={20260826} />
    </div>
  ),
}

/** The small-screen probe, pinned regardless of the preview's width. */
export const Reading: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <div className="relative h-screen w-full">
      <Leetype surface="reading" sessionSeed={20260826} />
    </div>
  ),
}

/** The production probe, pinned regardless of the preview's width. */
export const Typing: Story = {
  render: () => (
    <div className="relative h-screen w-full p-4">
      <Leetype surface="typing" sessionSeed={20260826} />
    </div>
  ),
}
