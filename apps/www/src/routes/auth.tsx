import type { JSX } from "react"
import { useState } from "react"
import { AuthPageTemplate } from "@some-ui/auth"
import type { AuthFlowStep } from "@some-ui/auth"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { createAccount, describeAuthError, signIn } from "@/lib/auth"
import { DATA_MODE } from "@/lib/data-mode"
import { passkeysSupported } from "@/lib/passkey"

type AuthSearch = { redirect?: string }

function validateSearch(search: Record<string, unknown>): AuthSearch {
  return typeof search.redirect === "string" &&
    search.redirect.startsWith("/") &&
    !search.redirect.startsWith("//") &&
    search.redirect !== "/auth"
    ? { redirect: search.redirect }
    : {}
}

const noop = (): void => undefined

const AuthPage = (): JSX.Element => {
  const { redirect = "/app" } = Route.useSearch()
  const navigate = useNavigate()
  const [step, setStep] = useState<AuthFlowStep>("sign-in")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = DATA_MODE === "static" || passkeysSupported()

  const run = (attempt: "sign-in" | "create"): void => {
    setPending(true)
    setError(null)
    const ceremony = attempt === "sign-in" ? signIn : createAccount
    ceremony()
      .then(() => navigate({ href: redirect }))
      .catch((cause: unknown) => setError(describeAuthError(cause, attempt)))
      .finally(() => setPending(false))
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
      onCreatePasskey={() => run("create")}
      pending={pending}
      error={error}
      passkeyAvailable={supported}
      passkeyFirst
      passkeyOnly
      productName="Some UI"
      welcome={{
        eyebrow: "Welcome",
        title: "Ready for another learning session?",
        description:
          "Continue with your passkey to pick up where you left off, or create one to start.",
      }}
      notice={
        DATA_MODE === "static"
          ? {
              title: "Preview only",
              description:
                "This build has no server, so there are no accounts. Continuing opens the demo.",
            }
          : !supported
            ? {
                title: "Passkeys aren't available here",
                description:
                  "This browser or connection can't use passkeys. Open the app over HTTPS in a current browser.",
              }
            : {
                title: "What the server keeps",
                description:
                  "A random account ID and your passkey's public key. Never a name, an email or your device's details.",
              }
      }
    />
  )
}

export const Route = createFileRoute("/auth")({
  validateSearch,
  component: AuthPage,
})
