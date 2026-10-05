/**
 * The settings controls for the account: sign out, sign out everywhere, add a
 * passkey on this device, delete the account.
 *
 * A passkey is the only way in (`paulgsc/server` `docs/identity.md`): no email
 * means no recovery, and the safety net is a second passkey, said next to the
 * button that adds one.
 *
 * Deleting takes two presses (the second button appears after the first): the
 * server deletes everything under the account's ID; logs and backups are not
 * rewritten, and the copy says so.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Button, Label, Separator } from "@some-ui/shared"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  addPasskey,
  deleteAccount,
  describeAuthError,
  signOut,
  signOutEverywhere,
} from "@/lib/auth"
import { ACCOUNT_KEEPS } from "@/lib/auth/account-keeps"
import { DATA_MODE } from "@/lib/data-mode"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { passkeysSupported } from "@/lib/passkey"

export const AccountSection = (): JSX.Element => {
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const serverAccount = DATA_MODE !== "static"

  const leaveTo = (message: string) => async (): Promise<void> => {
    toast.success(message)
    await navigate({ to: "/auth" })
  }

  const signOutIntent = useAsyncIntent(
    (_: undefined) => signOut().then(leaveTo("Signed out.")),
    { presentation: "interactive" }
  )
  const everywhereIntent = useAsyncIntent(
    (_: undefined) =>
      signOutEverywhere().then(leaveTo("Signed out on every device.")),
    { presentation: "interactive" }
  )
  const deleteIntent = useAsyncIntent(
    (_: undefined) =>
      deleteAccount().then(leaveTo("Your account and its data are deleted.")),
    { presentation: "interactive" }
  )
  const addIntent = useAsyncIntent(
    (_: undefined) =>
      addPasskey().then(
        () => {
          toast.success("Passkey added. It opens this same account.")
        },
        (error: unknown) => {
          toast.error(describeAuthError(error, "create"))
        }
      ),
    { presentation: "interactive" }
  )

  return (
    <section className="space-y-4" aria-labelledby="account-heading">
      <div className="space-y-1">
        <Label id="account-heading">Account</Label>
        <p className="text-muted-foreground text-sm">
          {serverAccount
            ? `Your passkey is your account. ${ACCOUNT_KEEPS}`
            : "This build has no server, so there is no account: everything stays in this browser."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <IntentButton
          state={signOutIntent.state}
          onPress={() => signOutIntent.start(undefined)}
          variant="outline"
          size="sm"
          idleLabel="Sign out"
          workingLabel="Signing out..."
        />
        {serverAccount ? (
          <IntentButton
            state={everywhereIntent.state}
            onPress={() => everywhereIntent.start(undefined)}
            variant="outline"
            size="sm"
            idleLabel="Sign out everywhere"
            workingLabel="Signing out..."
          />
        ) : null}
      </div>

      {serverAccount ? (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              There is no email to recover your account with. If your passkey
              doesn&apos;t sync to your other devices (a phone and a Windows
              laptop, say), add one on each, so losing one device doesn&apos;t
              lose the account.
            </p>
            <IntentButton
              state={addIntent.state}
              onPress={() => addIntent.start(undefined)}
              variant="outline"
              size="sm"
              disabled={!passkeysSupported()}
              idleLabel="Add a passkey on this device"
              workingLabel="Waiting for your passkey..."
            />
          </div>

          <Separator />
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Deleting removes everything stored under this account&apos;s ID
              from the server&apos;s database (your sessions, saved shelf items,
              reminder and progress records, and passkeys), so your passkeys
              will no longer open anything here. It does not rewrite server logs
              or backups, and it can&apos;t be undone.
            </p>
            {confirmingDelete ? (
              <div className="flex flex-wrap gap-2">
                <IntentButton
                  state={deleteIntent.state}
                  onPress={() => deleteIntent.start(undefined)}
                  variant="destructive"
                  size="sm"
                  idleLabel="Yes, delete my account"
                  workingLabel="Deleting..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep my account
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete account
              </Button>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
