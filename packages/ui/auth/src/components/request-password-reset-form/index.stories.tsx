import { AuthCard } from "@auth/components/auth-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { RequestPasswordResetForm } from "."

type Story = StoryObj<typeof RequestPasswordResetForm>
type Meta = MetaObj<typeof RequestPasswordResetForm>

export const Default: Story = {
  args: {},
}

/** Arriving from sign-in carries the address the user already typed. */
export const Prefilled: Story = {
  args: {
    defaultEmail: "you@example.com",
  },
}

export const Pending: Story = {
  args: {
    defaultEmail: "you@example.com",
    pending: true,
  },
}

/**
 * Only transport-level failures belong here. "No account with that email" does
 * not — the caller advances to the sent screen either way.
 */
export const ServerError: Story = {
  args: {
    error: "Could not reach the server. Try again.",
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/RequestPasswordResetForm",
  component: RequestPasswordResetForm,
  tags: ["autodocs"],
  args: {
    onBackToSignIn: () => undefined,
  },
  argTypes: {
    onSubmit: { action: "reset requested" },
  },
  decorators: [
    (Story) => (
      <AuthCard
        title="Reset password"
        description="We'll email you a link to set a new one."
      >
        <Story />
      </AuthCard>
    ),
  ],
}

export default meta
