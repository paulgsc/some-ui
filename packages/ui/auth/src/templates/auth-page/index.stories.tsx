import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { AuthPageTemplate } from "."

type Story = StoryObj<typeof AuthPageTemplate>

export const Default: Story = {}

export const SplitScreen: Story = {
  args: {
    aside: (
      <blockquote className="max-w-md text-lg">
        “One calm, consistent place to access your workspace.”
      </blockquote>
    ),
  },
}

export const PasskeyEnrollment: Story = {
  args: { step: "passkey-enrollment" },
}

const meta: Meta<typeof AuthPageTemplate> = {
  title: "UI/Auth/Templates/AuthPage",
  component: AuthPageTemplate,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    brand: <span className="font-semibold">Acme</span>,
    footer: <>By continuing, you agree to the terms and privacy policy.</>,
    step: "sign-in",
    productName: "Acme",
    passkeyAvailable: true,
    passkeyFirst: true,
    onStepChange: fn(),
    onSignIn: fn(),
    onSignUp: fn(),
    onRequestReset: fn(),
    onResetPassword: fn(),
    onVerifyCode: fn(),
    onPasskeySignIn: fn(),
    onCreatePasskey: fn(),
    onSkipPasskey: fn(),
  },
}

export default meta
