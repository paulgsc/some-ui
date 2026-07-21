import type { JSX } from "react"
import type { Decorator } from "@storybook/react-vite"
import { Toaster } from "sonner"

export const withToaster: Decorator = (Story, context): JSX.Element => (
  <>
    <Story {...context} />
    <Toaster />
  </>
)
