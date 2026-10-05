/**
 * Where this learner's sessions are kept, and the two things only the person
 * may do about it: keep an account, and copy what is on this device into one.
 *
 * Which of the four screens this is follows `lib/authority`:
 *
 * - **No server** (the demo): the account section's own "no server" copy.
 * - **On this device**: nothing about the sessions is sent anywhere and no
 *   account is needed. One button to keep an account (the passkey screen).
 * - **On the account**: the account's controls, and, if the device holds
 *   sessions the account does not, an offer to copy them. The offer names what
 *   is sent and where, and takes a second press (`sessions-transfer`, LA2).
 * - **Account session ended**: say so, in place, and offer to sign in or to
 *   carry on here. Nothing is lost either way.
 *
 * The Android build shows `DeviceSection` instead.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Button, Label, Separator } from "@some-ui/shared"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { authority, useAuthoritySnapshot } from "@/lib/authority"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { useCopyDeviceSessions, useTransferPreview } from "@/lib/tenant"

import { AccountSection } from "./account-section"

const plural = (n: number): string =>
  n === 1 ? "1 session" : `${String(n)} sessions`

const OnThisDevice = (): JSX.Element => {
  const navigate = useNavigate()
  return (
    <section className="space-y-2" aria-labelledby="data-home-heading">
      <Label id="data-home-heading">Where your sessions are kept</Label>
      <p className="text-muted-foreground text-sm">
        On this device. Nothing about them is sent to the server, and you
        don&apos;t need an account. They stay in this browser: clearing its site
        data removes them, and they don&apos;t follow you to your other devices.
        An account keeps them on the server so they do.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          void navigate({ to: "/auth", search: { redirect: "/settings" } })
        }
      >
        Keep an account
      </Button>
    </section>
  )
}

const AccountUnavailable = (): JSX.Element => {
  const navigate = useNavigate()
  return (
    <section className="space-y-2" aria-labelledby="data-home-heading">
      <Label id="data-home-heading">Your account</Label>
      <p className="text-muted-foreground text-sm">
        Your account session ended. You&apos;re learning on this device, and
        nothing was lost or sent. Sign in to see your account&apos;s data again.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            void navigate({ to: "/auth", search: { redirect: "/settings" } })
          }
        >
          Sign in
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => authority.chooseLocal()}
        >
          Use this device instead
        </Button>
      </div>
    </section>
  )
}

/** The explicit step: what would be sent, to which account, and a second press. */
const TransferControl = (): JSX.Element | null => {
  const copyNow = useCopyDeviceSessions()
  const preview = useTransferPreview()
  const [confirming, setConfirming] = useState(false)

  const copy = useAsyncIntent(
    (_: undefined) =>
      copyNow({
        copied: (count) => {
          setConfirming(false)
          toast.success(`Copied ${plural(count)} to your account.`)
        },
        partial: (copied, remaining) => {
          toast.error(
            `Copied ${plural(copied)}; ${plural(remaining)} didn't make it. Press copy again to carry on.`
          )
        },
        busy: () => {
          toast("Another tab is copying your sessions", {
            description: "Wait for it to finish, then check this screen again.",
          })
        },
        stale: () => {
          setConfirming(false)
          toast("Your account changed while copying, so it stopped.", {
            description:
              "Nothing more was sent. Check which account you are signed in to.",
          })
        },
      }),
    { presentation: "interactive" }
  )

  const toCopy = preview.data?.toCopy ?? 0
  const alreadyThere = preview.data?.alreadyThere ?? 0
  if (preview.data == null || (toCopy === 0 && alreadyThere === 0)) return null

  return (
    <>
      <Separator />
      <div className="space-y-2">
        {toCopy === 0 ? (
          <p className="text-muted-foreground text-sm">
            The sessions on this device are already in your account.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {plural(toCopy)} on this device{" "}
              {toCopy === 1 ? "isn't" : "aren't"} in your account. Copying sends{" "}
              {toCopy === 1 ? "its" : "their"} names, what is in{" "}
              {toCopy === 1 ? "it" : "them"} and when you started and finished{" "}
              {toCopy === 1 ? "it" : "them"} to this account, and nothing else.
              This device keeps its own copies. Nothing is copied unless you
              press this.
            </p>
            {confirming ? (
              <div className="flex flex-wrap gap-2">
                <IntentButton
                  state={copy.state}
                  onPress={() => copy.start(undefined)}
                  size="sm"
                  idleLabel={`Yes, copy ${plural(toCopy)}`}
                  workingLabel="Copying..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Not now
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Copy to my account...
              </Button>
            )}
          </>
        )}
      </div>
    </>
  )
}

export const DataHomeSection = (): JSX.Element => {
  const snapshot = useAuthoritySnapshot()

  if (snapshot.backend !== "remote") return <AccountSection />
  if (snapshot.accountUnavailable) return <AccountUnavailable />
  if (snapshot.authority.kind === "account") {
    return (
      <div className="space-y-4">
        <AccountSection />
        <TransferControl />
      </div>
    )
  }
  return <OnThisDevice />
}
