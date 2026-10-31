import type { JSX } from "react"
import { useState } from "react"
import { AuthPageTemplate } from "@some-ui/auth"
import type { AuthFlowStep } from "@some-ui/auth"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import {
  createAccount,
  describeAuthError,
  enterAccount,
  isSignupClosed,
  signIn,
} from "@/lib/auth"
import { ACCOUNT_KEEPS } from "@/lib/auth/account-keeps"
import { authority, useAuthoritySnapshot } from "@/lib/authority"
import { DATA_MODE } from "@/lib/data-mode"
import { passkeysSupported } from "@/lib/passkey"
import { DeviceSessionLost } from "@/components/auth/device-session-lost"

type AuthSearch = { redirect?: string }

function validateSearch(search: Record<string, unknown>): AuthSearch {
  return typeof search.redirect === "string" &&
    search.redirect.startsWith("/") &&
    !search.redirect.startsWith("//") &&
    // A browser reads `\` as `/` in a URL, so `/\host` is `//host`.
    !search.redirect.includes("\\") &&
    search.redirect !== "/auth"
    ? { redirect: search.redirect }
    : {}
}

const noop = (): void => undefined

const PasskeyScreen = (): JSX.Element => {
  const { redirect = "/app" } = Route.useSearch()
  const navigate = useNavigate()
  const [step, setStep] = useState<AuthFlowStep>("sign-in")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Once the server says it already has its owner's account, creating one
  // can only fail again: the error says to sign in, beside the create card's
  // own "Already have a passkey? Sign in", and nothing offers creating again.
  const [signupClosed, setSignupClosed] = useState(false)
  const supported = DATA_MODE === "static" || passkeysSupported()

  const run = (attempt: "sign-in" | "create"): void => {
    setPending(true)
    setError(null)
    const ceremony = attempt === "sign-in" ? signIn : createAccount
    ceremony()
      .then(() =>
        // Narrowed here because type-aware lint reads `useSearch()` as `any`.
        enterAccount(
          typeof redirect === "string" ? redirect : "/app",
          (href) => void navigate({ href })
        )
      )
      .catch((cause: unknown) => {
        if (isSignupClosed(cause)) setSignupClosed(true)
        setError(describeAuthError(cause, attempt))
      })
      .finally(() => setPending(false))
  }

  // Where a server is optional, an account is a choice and not a gate: say so,
  // and let the person make the other one. It is persisted (`lib/authority`),
  // so it is a decision and not a dismissed banner.
  const optional = useAuthoritySnapshot().backend === "remote"
  const chooseDevice = (): void => {
    authority.chooseLocal()
    void navigate({ href: typeof redirect === "string" ? redirect : "/app" })
  }

  const changeStep = (next: AuthFlowStep): void => {
    setError(null)
    setStep(next)
  }

  return (
    <AuthPageTemplate
      step={step}
      onStepChange={changeStep}
      onSignIn={noop}
      onSignUp={noop}
      onRequestReset={noop}
      onResetPassword={noop}
      onVerifyCode={noop}
      onPasskeySignIn={() => run("sign-in")}
      // Without passkey support, or once the server makes no new accounts,
      // "Create a passkey" could only fail: the sign-in card stops offering
      // it and the create card's button is disabled.
      {...(supported && !signupClosed
        ? { onCreatePasskey: () => run("create") }
        : {})}
      pending={pending}
      error={error}
      passkeyAvailable={supported}
      passkeyFirst
      passkeyOnly
      productName="Some UI"
      {...(optional
        ? {
            footer: (
              <>
                Don&apos;t want an account?{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
                  onClick={chooseDevice}
                >
                  Use Some UI on this device
                </button>
                . Your sessions stay in this browser and nothing about them is
                sent to the server.
              </>
            ),
          }
        : {})}
      welcome={{
        eyebrow: "Welcome",
        title: "Ready for another learning session?",
        description:
          "Continue with your passkey to pick up where you left off, or create one to start.",
      }}
      notice={
        DATA_MODE === "static"
          ? {
              title: "A demo on sample data",
              description:
                "This build has no server, so there are no accounts. Continuing opens my toolkit on sample data; try anything, and nothing you do is kept.",
            }
          : !supported
            ? {
                title: "Passkeys aren't available here",
                description:
                  "This browser or connection can't use passkeys. Open the app over HTTPS in a current browser.",
              }
            : {
                title: "What the server keeps",
                description: ACCOUNT_KEEPS,
              }
      }
    />
  )
}

/**
 * The Android app has no sign-in (src/components/auth/device-session-lost).
 * The flag is read here, not through a module's constant, so the passkey
 * screen and everything only it imports never reach that build
 * (packages/some-vite-config/AUDIENCES.md, "Paths").
 */
const AuthPage = (): JSX.Element => {
  const search = Route.useSearch()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <DeviceSessionLost {...search} />
  ) : (
    <PasskeyScreen />
  )
}

export const Route = createFileRoute("/auth")({
  validateSearch,
  component: AuthPage,
})
