import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { PasskeyEnrollment } from "."
import { AuthCard } from "../auth-card"

type Story = StoryObj<typeof PasskeyEnrollment>

export const Default: Story = {
  render: (args) => (
    <AuthCard title="Protect your account" description="Passwordless sign-in">
      <PasskeyEnrollment {...args} />
    </AuthCard>
  ),
}

export const Error: Story = {
  ...Default,
  args: { error: "That passkey could not be saved. Please try again." },
}

const meta: Meta<typeof PasskeyEnrollment> = {
  title: "UI/Auth/Components/PasskeyEnrollment",
  component: PasskeyEnrollment,
  tags: ["autodocs"],
  args: { onCreate: fn(), onSkip: fn() },
}

export default meta
