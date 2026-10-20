/**
 * The settings controls for the account: sign out, sign out everywhere, add a
 * passkey on this device, pair a phone, delete the account.
 *
 * A passkey is the only way in (`paulgsc/server` `docs/identity.md`): no email
 * means no recovery, and the safety net is a second passkey, said next to the
 * button that adds one.
 *
 * Pairing shows a one-time code and the address to type with it on the
 * phone; the phone itself sends nothing until it is tapped there (LA8). No
 * list of paired phones: the server keeps no record of which session is a
 * phone (`paulgsc/server` `docs/identity.md`), so a lost one is unpaired by
 * signing out everywhere.
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
  startPairing,
} from "@/lib/auth"
import { ACCOUNT_KEEPS } from "@/lib/auth/account-keeps"
import { absoluteFileHostBase } from "@/lib/file-host-config"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { passkeysSupported } from "@/lib/passkey"

export const AccountSection = (): JSX.Element => {
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
      signOutEverywhere().then(
        leaveTo("Signed out on every device, paired phones included.")
      ),
    { presentation: "interactive" }
  )
  const deleteIntent = useAsyncIntent(
    (_: undefined) =>
      deleteAccount().then(leaveTo("Your account and its data are deleted.")),
    { presentation: "interactive" }
  )
  const pairIntent = useAsyncIntent((_: undefined) => startPairing(), {
    presentation: "interactive",
  })
  const pairing =
    pairIntent.state.status === "succeeded" ? pairIntent.state.value : null
  // The phone pairs over https only (LA8): a code it could not use is not
  // offered.
  const pairAt = absoluteFileHostBase()
  const pairable = pairAt?.startsWith("https:") ?? false
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
          {`Your passkey is your account. ${ACCOUNT_KEEPS}`}
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
        <IntentButton
          state={everywhereIntent.state}
          onPress={() => everywhereIntent.start(undefined)}
          variant="outline"
          size="sm"
          idleLabel="Sign out everywhere"
          workingLabel="Signing out..."
        />
      </div>

      <Separator />
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          There is no email to recover your account with. If your passkey
          doesn&apos;t sync to your other devices (a phone and a Windows laptop,
          say), add one on each, so losing one device doesn&apos;t lose the
          account.
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
      <div className="space-y-2" aria-labelledby="phones-heading">
        <Label id="phones-heading">Phones</Label>
        <p className="text-muted-foreground text-sm">
          A paired phone sends here only what you tap to send, or chose there to
          keep sending, and names this server first. To unpair a lost phone,
          sign out everywhere.
        </p>
        {pairAt !== undefined && !pairable ? (
          <p className="text-muted-foreground text-xs break-all">
            Phones pair over https only, and this server is at {pairAt}.
          </p>
        ) : null}
        {pairing ? (
          <div className="space-y-1" role="status">
            <p className="text-sm">Code for your phone</p>
            <p className="font-mono text-2xl tracking-widest select-all">
              {pairing.code.slice(0, 4)} {pairing.code.slice(4)}
            </p>
            <p className="text-muted-foreground text-xs break-all">
              On the phone: Settings, This phone, Pair, with{" "}
              <span className="select-all">{pairAt}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              Works once, until{" "}
              {new Date(pairing.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
        ) : null}
        <IntentButton
          state={pairIntent.state}
          onPress={() => pairIntent.start(undefined)}
          variant="outline"
          size="sm"
          disabled={!pairable}
          idleLabel={pairing ? "Get a new code" : "Pair a phone"}
          workingLabel="Getting a code..."
        />
      </div>

      <Separator />
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Deleting removes everything stored under this account&apos;s ID from
          the server&apos;s database (your sessions, saved shelf items, reminder
          and progress records, and passkeys), so your passkeys will no longer
          open anything here. It does not rewrite server logs or backups, and it
          can&apos;t be undone.
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
    </section>
  )
}
