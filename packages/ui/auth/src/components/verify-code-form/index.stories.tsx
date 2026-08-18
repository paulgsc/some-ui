import { AuthCard } from "@auth/components/auth-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { VerifyCodeForm } from "."

type Story = StoryObj<typeof VerifyCodeForm>
type Meta = MetaObj<typeof VerifyCodeForm>

/** Filling the last digit submits on its own — paste `123456` to see it. */
export const Default: Story = {
  args: {
    destination: "you@example.com",
  },
}

/** Off for backends that count attempts aggressively. */
export const WithoutAutoSubmit: Story = {
  args: {
    destination: "you@example.com",
    autoSubmit: false,
  },
}

export const Pending: Story = {
  args: {
    destination: "you@example.com",
    pending: true,
  },
}

export const WrongCode: Story = {
  args: {
    destination: "you@example.com",
    error: "That code is not valid. Request a new one.",
  },
}

/** The resend rate limit is the caller's — the form only reflects it. */
export const ResendOnCooldown: Story = {
  args: {
    destination: "you@example.com",
    canResend: false,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/VerifyCodeForm",
  component: VerifyCodeForm,
  tags: ["autodocs"],
  args: {
    onBack: () => undefined,
  },
  argTypes: {
    onSubmit: { action: "code submitted" },
    onResend: { action: "resend requested" },
  },
  decorators: [
    (Story) => (
      <AuthCard title="Check your email" description="One more step.">
        <Story />
      </AuthCard>
    ),
  ],
}

export default meta
