import type { JSX } from "react"
import { useState } from "react"
import { AuthPageTemplate } from "@some-ui/auth"
import type { AuthFlowStep } from "@some-ui/auth"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import {
  createAccount,
  describeAuthError,
  enterAccount,
  readLegacyClaim,
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
  const supported = DATA_MODE === "static" || passkeysSupported()
  // An operator's `/auth#claim=<token>` link: the account created from it
  // inherits what the server kept before accounts. Read once; a static
  // build has no server to claim from.
  const [claim] = useState(() =>
    DATA_MODE === "static" || typeof window === "undefined"
      ? undefined
      : readLegacyClaim(window.location.hash)
  )

  const run = (attempt: "sign-in" | "create"): void => {
    setPending(true)
    setError(null)
    const ceremony =
      attempt === "sign-in" ? signIn : (): Promise<void> => createAccount(claim)
    const described =
      attempt === "create" && claim !== undefined ? "claim" : attempt
    ceremony()
      .then(() =>
        // Narrowed here because type-aware lint reads `useSearch()` as `any`.
        enterAccount(
          typeof redirect === "string" ? redirect : "/app",
          (href) => void navigate({ href })
        )
      )
      .catch((cause: unknown) => setError(describeAuthError(cause, described)))
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
      // Without passkey support, "Create a passkey" could only fail, so the
      // flow shows no create action at all.
      {...(supported ? { onCreatePasskey: () => run("create") } : {})}
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
            : claim !== undefined
              ? {
                  title: "Claiming this server's earlier data",
                  description:
                    "Create a passkey to make the account that takes over what this server kept before accounts. The link works once.",
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
