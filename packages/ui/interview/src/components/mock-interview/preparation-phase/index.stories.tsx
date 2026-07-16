import type { Meta, StoryObj } from "@storybook/react-vite"

import { PreparationPhase } from "."

const meta = {
  title: "UI/Chat/Interview/PreparationPhase",
  component: PreparationPhase,
} satisfies Meta<typeof PreparationPhase>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    question:
      "Design a URL shortening service like bit.ly. Consider scalability, database design, and API endpoints.",
    notes: "",
    onNotesChange: () => {},
    onStartRecording: () => {},
  },
}

export const WithNotes: Story = {
  args: {
    ...Default.args,
    notes: "Start with requirements: read/write ratio, custom aliases, expiry.",
  },
}
