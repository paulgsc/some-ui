import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@some-ui/shared"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AuthFlow } from "."
import { useAuthFlow } from "../../hooks/use-auth-flow"
import type { AuthStatus, OAuthProvider } from "../../types/auth"
import { AuthGate } from "../auth-gate"

type Story = StoryObj<typeof AuthFlow>
type Meta = MetaObj<typeof AuthFlow>

/** Enough delay for the pending state to be visible without being annoying. */
const FAKE_LATENCY_MS = 600

const DEMO_PROVIDERS: ReadonlyArray<OAuthProvider> = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
]

type HarnessProps = {
  providers?: ReadonlyArray<OAuthProvider>
  /** Makes the stand-in backend reject everything, to exercise error states. */
  alwaysFails?: boolean
  /** Sends sign-in through a second factor instead of straight to the app. */
  requiresSecondFactor?: boolean
}

/**
 * A stand-in for the Rust backend, so the flow can be driven end to end in
 * Storybook. This is exactly the layer the package does not ship: the
 * components below know only `pending`, `error`, and which step to show.
 */
const AuthFlowHarness = ({
  providers = [],
  alwaysFails = false,
  requiresSecondFactor = false,
}: HarnessProps) => {
  const { step, goTo, reset } = useAuthFlow()
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>("unauthenticated")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  const request = useCallback(
    (onSettled: () => void) => {
      setError(null)
      setPending(true)
      timer.current = setTimeout(() => {
        setPending(false)
        if (alwaysFails) {
          setError("The stand-in backend refused that request.")
          return
        }
        onSettled()
      }, FAKE_LATENCY_MS)
    },
    [alwaysFails]
  )

  const signOut = useCallback(() => {
    setStatus("unauthenticated")
    setEmail("")
    setError(null)
    reset()
  }, [reset])

  return (
    <AuthGate
      status={status}
      fallback={
        <AuthFlow
          step={step}
          onStepChange={goTo}
          email={email}
          productName="the demo app"
          providers={providers}
          onProviderSelect={
            providers.length > 0
              ? () => request(() => setStatus("authenticated"))
              : undefined
          }
          pending={pending}
          error={error}
          onSignIn={(values) => {
            setEmail(values.email)
            request(() =>
              requiresSecondFactor
                ? goTo("verify-code")
                : setStatus("authenticated")
            )
          }}
          onSignUp={(values) => {
            setEmail(values.email)
            request(() => goTo("verify-code"))
          }}
          onVerifyCode={() => request(() => setStatus("authenticated"))}
          onResendCode={() => request(() => undefined)}
          onRequestReset={(values) => {
            setEmail(values.email)
            // Advances on any completed request, including for an address with
            // no account — reporting "no such user" here leaks the same thing
            // a specific sign-in error would.
            request(() => goTo("reset-sent"))
          }}
          onResetPassword={() => request(() => goTo("sign-in"))}
        />
      }
    >
      <div className="w-full max-w-sm space-y-3 rounded-xl border p-6">
        <p className="text-sm font-medium">Signed in</p>
        <p className="text-muted-foreground text-sm">
          {email === "" ? "Session established." : `Session for ${email}.`} The
          gated content renders here.
        </p>
        <Button variant="outline" onClick={signOut} className="w-full">
          Sign out
        </Button>
      </div>
    </AuthGate>
  )
}

/**
 * The whole workflow, driven by a stand-in backend. Sign in, or follow
 * "Forgot password?" through request → sent, or create an account to land on
 * the verification step.
 */
export const Default: Story = {
  render: () => <AuthFlowHarness />,
}

export const WithProviders: Story = {
  render: () => <AuthFlowHarness providers={DEMO_PROVIDERS} />,
}

/** Sign-in routes through a second factor before the session is established. */
export const WithSecondFactor: Story = {
  render: () => <AuthFlowHarness requiresSecondFactor />,
}

/** Every request fails, so each step's error banner is reachable. */
export const AlwaysFailing: Story = {
  render: () => <AuthFlowHarness alwaysFails />,
}

/**
 * Individual steps, rendered directly. `step` is a prop, so a router can hold
 * it — which is the point: a reset link has to be able to land straight on
 * `reset-password`.
 */
export const StepSignUp: Story = {
  args: {
    step: "sign-up",
  },
}

export const StepResetSent: Story = {
  args: {
    step: "reset-sent",
    email: "you@example.com",
  },
}

export const StepResetPassword: Story = {
  args: {
    step: "reset-password",
    email: "you@example.com",
  },
}

export const StepPasskeyEnrollment: Story = {
  args: {
    step: "passkey-enrollment",
    onCreatePasskey: () => undefined,
    onSkipPasskey: () => undefined,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthFlow",
  component: AuthFlow,
  tags: ["autodocs"],
  args: {
    step: "sign-in",
    onStepChange: () => undefined,
    onSignIn: () => undefined,
    onSignUp: () => undefined,
    onRequestReset: () => undefined,
    onResetPassword: () => undefined,
    onVerifyCode: () => undefined,
  },
}

export default meta
