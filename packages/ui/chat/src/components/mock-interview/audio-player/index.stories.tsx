import type { Meta, StoryObj } from "@storybook/react-vite"

import { AudioPlayer } from "."

const meta: Meta<typeof AudioPlayer> = {
  title: "UI/Chat/Components/MockInterview/AudioPlayer",
  component: AudioPlayer,
}
export default meta
type Story = StoryObj<typeof AudioPlayer>

/**
 * No real audio backs this in Storybook - it demonstrates the manual
 * play/pause toggle. The native `onPlay`/`onPause`/`onEnded` handlers stay
 * wired to whatever a real recording URL would provide.
 */
export const Default: Story = {
  args: {
    url: "blob:storybook-fake-recording",
  },
}
