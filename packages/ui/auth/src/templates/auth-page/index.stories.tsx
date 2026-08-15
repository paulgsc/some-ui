import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { AuthPageTemplate } from "."

type Story = StoryObj<typeof AuthPageTemplate>

export const Default: Story = {}

export const SplitScreen: Story = {
  args: {
    welcome: {
      eyebrow: "Welcome back",
      title: "Ready to continue?",
      description: "Use your passkey to pick up where you left off.",
    },
    notice: {
      title: "Preview",
      description: "Authentication is not connected in this story.",
    },
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
    brand: undefined,
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
