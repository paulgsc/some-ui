/**
 * The Android app's stand-in for the account section: what is on this phone,
 * and the Home server block, the one place on the phone that sends anything
 * to the home server (LA8, docs/learner-data-authority.md).
 *
 * Every hop is a tap here, and names where it goes (LA8); `lib/home-link`
 * owns the work, and this component only shows it.
 */

import type { JSX } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Input, Label } from "@some-ui/shared"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { homeApiBase } from "@/lib/device-backend/home-sync"
import type { HomeLinkState, PairFailure, UnpairedNote } from "@/lib/home-link"
import {
  homeLink,
  hostOf,
  pairingAddress,
  typedCode,
  useHomeLink,
} from "@/lib/home-link"
import { keepOnHome, useLaneChoices } from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import { remember, remembered } from "@/lib/home-link/remembered"
import { lastSend, onPhone, sendHome } from "@/lib/home-link/send"
import type { SyncResult } from "@/lib/home-link/sync"
import { lastSync, syncLessonsFrom } from "@/lib/home-link/sync"
import {
  KEEP_SENDING,
  KEEP_SENDING_MORE,
  KEEP_SENDING_REFUSED,
  KEEP_SENDING_SAID,
  KEPT_NOTE,
} from "@/lib/home-link/words"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import {
  DeviceArchive,
  DeviceStorageSummary,
} from "@/components/settings/device-storage"

const HOME_KEY = "some-ui.device.home-server.v1"

/** A bare address as its host, for "Reads from"; `null` when it is not one. */
function typedHost(address: string): string | null {
  try {
    return hostOf(homeApiBase(address))
  } catch {
    return null
  }
}

const NOTES: Record<UnpairedNote, string> = {
  unpaired: "Unpaired.",
  "unpaired-offline":
    "Unpaired on this phone. Home couldn't be reached, so it still holds this phone's key until it expires: sign out everywhere on your computer to end it now.",
  lost: "This phone's pairing didn't survive a restore. Pair again; to end the old one, sign out everywhere on your computer.",
  unreadable:
    "This phone couldn't read its pairing just now. Restart the app to try again. Pairing again replaces it; to end the old one, sign out everywhere on your computer.",
}

function failureLine(failure: PairFailure, host: string): string {
  switch (failure) {
    case "unreachable": {
      return `Couldn't reach ${host}. Are you on the home network?`
    }
    case "untrusted": {
      return `This phone doesn't trust ${host}'s certificate. Nothing was sent.`
    }
    case "bad-code": {
      return "That code didn't work. Codes work once, for 10 minutes. Get a new one on your computer."
    }
    case "too-many": {
      return "Too many tries. Wait a minute and try again."
    }
    case "not-set-up": {
      return `${host} can't pair phones: passkey sign-in isn't set up there.`
    }
    case "not-home": {
      return `${host} doesn't answer as a home server. Check the address your computer shows.`
    }
    case "not-kept": {
      return "This phone couldn't keep the pairing. Get a new code and try again."
    }
    case "other": {
      return "Pairing failed. Get a new code and try again."
    }
    default: {
      return assertNever(failure)
    }
  }
}

/** The pairing form: an https address and the code from the computer. */
const PairForm = ({
  state,
  onCancel,
}: {
  state: HomeLinkState
  onCancel: () => void
}): JSX.Element => {
  const [address, setAddress] = useState("")
  const [code, setCode] = useState("")
  const read = pairingAddress(address)
  const target = typeof read === "string" ? null : read
  const typed = typedCode(code)
  const pairing = state.activity.kind === "pairing"
  const pair = useAsyncIntent(
    (variables: { target: NonNullable<typeof target>; code: string }) =>
      homeLink().pair(variables.target, variables.code),
    { presentation: "interactive" }
  )

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="pair-address">Home server address</Label>
      <Input
        id="pair-address"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="https://file-host.home.example"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      {read === "not-https" ? (
        <p className="text-destructive text-xs">
          Pairing needs an https:// address.
        </p>
      ) : null}
      <Label htmlFor="pair-code">Code from your computer</Label>
      <Input
        id="pair-code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="one-time-code"
        placeholder="K7QF 2M9X"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      {state.pairFailure ? (
        <p className="text-destructive text-xs" role="status">
          {failureLine(
            state.pairFailure.failure,
            hostOf(state.pairFailure.base)
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <IntentButton
          state={pair.state}
          onPress={() => {
            if (target && typed) pair.start({ target, code: typed })
          }}
          disabled={!target || !typed || pairing}
          size="sm"
          idleLabel={target ? `Pair with ${target.host}` : "Pair"}
          workingLabel="Pairing..."
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Sends only this code.</p>
    </div>
  )
}

/** A sync's or send's end, said once. */
const say = (result: SyncResult): void => {
  if (result.line === "") return
  if (result.ok) toast.success(result.line)
  else toast.error(result.line)
}

const StopButton = ({ stopping }: { stopping: boolean }): JSX.Element => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    disabled={stopping}
    onClick={() => homeLink().stop()}
  >
    {stopping ? "Stopping..." : "Stop"}
  </Button>
)

/**
 * "Send to home" in three taps' worth of steps (LA8): count what would go
 * (what home lacks, by `./sent`), a confirm naming that count and the host,
 * then the one button that sends, with Stop while it runs. The confirm offers, unticked every time, to keep
 * sending Practice from now on (LA11); ticked, the send adds that choice to
 * the consent log before it starts.
 */
const SendHome = ({
  base,
  pairing,
  refresh,
  state,
}: {
  base: string
  /** The pairing a ticked box keeps Practice on home under (LA11). */
  pairing: string
  refresh: () => unknown
  state: HomeLinkState
}): JSX.Element => {
  const { activity } = state
  const host = hostOf(base)
  const count = useAsyncIntent((_: undefined) => onPhone(pairing), {
    presentation: "interactive",
  })
  const run = useAsyncIntent(
    (_: undefined) => sendHome({ base, id: pairing }, refresh),
    {
      presentation: "interactive",
    }
  )
  useIntentEffect(run, say)
  const asking = count.state.status === "succeeded" ? count.state.value : null
  const last = lastSend()
  const kept = useLaneChoices(practiceLane).shared.size > 0
  const [keepSending, setKeepSending] = useState(false)
  const ask = (): void => {
    setKeepSending(false)
    count.start(undefined)
  }

  return (
    <div className="space-y-2">
      {run.state.status === "working" && activity.kind === "sending" ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm">Sending to {host}...</p>
          <StopButton stopping={activity.stopping} />
        </div>
      ) : asking === null ? (
        <IntentButton
          state={count.state}
          onPress={ask}
          disabled={activity.kind !== "idle"}
          variant="outline"
          size="sm"
          idleLabel={`Send to ${host}...`}
          workingLabel="Counting..."
        />
      ) : asking.total === 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm">
            {asking.taken > 0
              ? `Nothing new to send: ${host} took every kept item as it is now.`
              : "Nothing on this phone to send."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => count.reset()}
          >
            OK
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm break-words">
            Send {asking.what} to {host}? Finished sessions are cleared from
            this phone once they&apos;re there.
          </p>
          {kept ? null : (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <input
                id="keep-sending"
                type="checkbox"
                aria-describedby="keep-sending-more"
                className="accent-primary mt-0.5 size-5 shrink-0"
                checked={keepSending}
                onChange={(event) => setKeepSending(event.target.checked)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="keep-sending" className="text-sm font-medium">
                  {KEEP_SENDING}
                </Label>
                <p
                  id="keep-sending-more"
                  className="text-muted-foreground text-xs"
                >
                  {KEEP_SENDING_MORE}
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <IntentButton
              state={run.state}
              onPress={() => {
                count.reset()
                if (
                  keepSending &&
                  !keepOnHome(practiceLane, pairing, KEEP_SENDING_SAID)
                ) {
                  toast.error(KEEP_SENDING_REFUSED)
                }
                run.start(undefined)
              }}
              disabled={activity.kind !== "idle"}
              size="sm"
              idleLabel={`Send ${asking.total}`}
              workingLabel="Sending..."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => count.reset()}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {kept ? (
        <p className="text-muted-foreground text-xs">{KEPT_NOTE}</p>
      ) : null}
      {last === "" ? null : (
        <p className="text-muted-foreground text-xs break-all">
          Last send: {last}
        </p>
      )}
    </div>
  )
}

export const DeviceSection = (): JSX.Element => {
  const queryClient = useQueryClient()
  const state = useHomeLink()
  const [address, setAddress] = useState(() => remembered(HOME_KEY))
  const [pairOpen, setPairOpen] = useState(false)
  const [confirmingUnpair, setConfirmingUnpair] = useState(false)

  const { link, activity } = state
  const paired = link.kind === "paired" ? link : null
  const typed = address.trim()
  const base = paired ? paired.base : typed === "" ? null : homeApiBase(typed)
  const host = paired ? hostOf(paired.base) : typedHost(typed)
  const syncing = activity.kind === "syncing"

  const sync = useAsyncIntent(
    (from: string) =>
      syncLessonsFrom(from, () => queryClient.invalidateQueries()),
    { presentation: "interactive" }
  )
  useIntentEffect(sync, say)
  const synced = lastSync()
  const unpair = useAsyncIntent((_: undefined) => homeLink().unpair(), {
    presentation: "interactive",
  })

  return (
    <section className="space-y-4" aria-labelledby="device-heading">
      <div className="space-y-1">
        <Label id="device-heading">This phone</Label>
        <p className="text-muted-foreground text-sm">
          Saved on this phone, and works offline. Lessons sync from your home
          server.
        </p>
      </div>

      <DeviceStorageSummary />
      <DeviceArchive />

      <div className="space-y-2" aria-labelledby="home-heading">
        <Label id="home-heading" htmlFor="home-server">
          Home server
        </Label>
        {paired ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm break-all">Paired · {host}</p>
              {confirmingUnpair ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activity.kind !== "idle"}
                  onClick={() => setConfirmingUnpair(true)}
                >
                  Unpair
                </Button>
              )}
            </div>
            {confirmingUnpair ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Unpair from {host}? This phone forgets its key and can&apos;t
                  send there until you pair again. Nothing already sent is
                  deleted.
                </p>
                <div className="flex flex-wrap gap-2">
                  <IntentButton
                    state={unpair.state}
                    onPress={() => {
                      setConfirmingUnpair(false)
                      unpair.start(undefined)
                    }}
                    variant="destructive"
                    size="sm"
                    idleLabel="Yes, unpair"
                    workingLabel="Unpairing..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingUnpair(false)}
                  >
                    Keep
                  </Button>
                </div>
              </div>
            ) : null}
            {paired.notForgotten ? (
              <p className="text-destructive text-xs" role="status">
                This phone couldn&apos;t forget its key, so it is still paired.
                Try Unpair again.
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Nothing is sent unless you tap below, except what you chose to
              keep on home, each only while it is open: aph, the Jobs record,
              and Practice.
            </p>
            {confirmingUnpair ? null : (
              <SendHome
                base={paired.base}
                pairing={paired.id}
                refresh={() => queryClient.invalidateQueries()}
                state={state}
              />
            )}
          </>
        ) : (
          <>
            <Input
              id="home-server"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="192.168.1.10:3000"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            {host === null ? null : (
              <p className="text-muted-foreground text-xs break-all">
                Reads from {host}
              </p>
            )}
            {link.kind === "unpaired" && link.note !== null ? (
              <p className="text-muted-foreground text-xs" role="status">
                {NOTES[link.note]}
              </p>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {syncing ? (
            <StopButton stopping={activity.stopping} />
          ) : (
            <IntentButton
              state={sync.state}
              onPress={() => {
                if (base === null) return
                if (!paired) remember(HOME_KEY, typed)
                sync.start(base)
              }}
              disabled={
                base === null ||
                link.kind === "reading" ||
                activity.kind !== "idle"
              }
              variant="outline"
              size="sm"
              idleLabel="Sync lessons from home"
              workingLabel="Syncing..."
            />
          )}
          {paired || pairOpen ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={link.kind !== "unpaired" || activity.kind !== "idle"}
              onClick={() => setPairOpen(true)}
            >
              Pair...
            </Button>
          )}
        </div>
        {synced === "" ? null : (
          <p className="text-muted-foreground text-xs break-all">
            Last sync: {synced}
          </p>
        )}
        {pairOpen && !paired ? (
          <PairForm state={state} onCancel={() => setPairOpen(false)} />
        ) : null}
      </div>
    </section>
  )
}
