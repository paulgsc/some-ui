/**
 * The Android app's Home page (Settings → Home, paulgsc/some-ui#2107): the
 * Home server block, where the phone is paired, unpaired and synced, and
 * where a finished session home holds is cleared from the phone (LA8,
 * docs/learner-data-authority.md), each a tap that names where it goes.
 * Everything else the phone keeps goes to home on its own once paired
 * (LA15), and this page says what is kept where and what waits
 * (`./device-kept-on-home`, `./device-routine-reads`). `lib/home-link` owns
 * the work, and this component only shows it.
 */

import type { JSX } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Input, Label, Notice } from "@some-ui/shared"
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
import type { ClearEnd } from "@/lib/home-link/clear"
import { clearHeld, finishedOnPhone } from "@/lib/home-link/clear"
import { remember, remembered } from "@/lib/home-link/remembered"
import type { SyncResult } from "@/lib/home-link/sync"
import { lastSync, syncLessonsFrom } from "@/lib/home-link/sync"
import { CLEAR, HOME_BLOCK } from "@/lib/home-link/words"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { KeptOnHome } from "@/components/settings/device-kept-on-home"
import { DeviceRoutineReads } from "@/components/settings/device-routine-reads"

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
  const { pairFailure } = state
  const failed =
    pairFailure === null
      ? null
      : failureLine(pairFailure.failure, hostOf(pairFailure.base))
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
      {read === "not-https" && (
        <Notice tone="warning">Pairing needs an https:// address.</Notice>
      )}
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
      {/* Pair takes the row's room whatever host it names, so a keystroke
          moves neither it nor Cancel (HS1). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <IntentButton
          state={pair.state}
          onPress={() => {
            if (target && typed) pair.start({ target, code: typed })
          }}
          disabled={!target || !typed || pairing}
          size="sm"
          className="w-full"
          idleLabel={
            <span className="min-w-0 truncate">
              {target ? `Pair with ${target.host}` : "Pair"}
            </span>
          }
          workingLabel="Pairing..."
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Sends only this code.</p>
      {failed !== null && (
        <Notice key={failed} tone="danger" dismissible>
          {failed}
        </Notice>
      )}
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
 * "Clear finished sessions home holds" in two presses (LA8): a count of the
 * finished sessions this phone holds, a confirm naming that count and the
 * host, then the one button that asks home about each and lets go of those
 * it holds exactly as the phone does (`lib/home-link/clear`). It sends
 * nothing: the drain has copied them already.
 */
const ClearHeld = ({
  base,
  refresh,
  state,
  blocked,
}: {
  base: string
  refresh: () => unknown
  state: HomeLinkState
  /** Another question is open (Unpair's): its buttons wait, disabled. */
  blocked: boolean
}): JSX.Element => {
  const { activity } = state
  const idle = activity.kind === "idle" && !blocked
  const host = hostOf(base)
  const count = useAsyncIntent((_: undefined) => finishedOnPhone(), {
    presentation: "interactive",
  })
  const run = useAsyncIntent((_: undefined) => clearHeld(refresh), {
    presentation: "interactive",
  })
  useIntentEffect(run, (end: ClearEnd) => {
    const line = CLEAR.ended(end, host)
    if (end.kind === "cleared" || end.kind === "nothing") toast.success(line)
    else toast.error(line)
  })
  const asking = count.state.status === "succeeded" ? count.state.value : null
  const working = run.state.status === "working" && activity.kind === "sending"

  return (
    <div className="space-y-2">
      {working && (
        <Notice>
          <span className="flex flex-wrap items-center gap-2">
            <span>Asking {host}...</span>
            <StopButton stopping={activity.stopping} />
          </span>
        </Notice>
      )}
      {asking === 0 && (
        <Notice action={{ label: "OK", onClick: () => count.reset() }}>
          {CLEAR.nothing}
        </Notice>
      )}
      {asking === null || asking === 0 || working ? (
        <IntentButton
          state={count.state}
          onPress={() => count.start(undefined)}
          disabled={!idle}
          variant="outline"
          size="sm"
          idleLabel={CLEAR.button}
          workingLabel="Counting..."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm break-words">{CLEAR.question(asking, host)}</p>
          <div className="flex flex-wrap gap-2">
            <IntentButton
              state={run.state}
              onPress={() => {
                count.reset()
                run.start(undefined)
              }}
              disabled={!idle}
              variant="destructive"
              size="sm"
              idleLabel={CLEAR.yes}
              workingLabel="Asking..."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => count.reset()}
            >
              {CLEAR.no}
            </Button>
          </div>
        </div>
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
  const note = link.kind === "unpaired" ? link.note : null
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
    <section className="space-y-4" aria-labelledby="home-heading">
      <div className="space-y-2">
        <Label id="home-heading" htmlFor="home-server">
          Home server
        </Label>
        {paired ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm break-all">Paired · {host}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activity.kind !== "idle" || confirmingUnpair}
                onClick={() => setConfirmingUnpair(true)}
              >
                Unpair
              </Button>
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
              <Notice tone="danger" dismissible>
                This phone couldn&apos;t forget its key, so it is still paired.
                Try Unpair again.
              </Notice>
            ) : null}
            <p className="text-muted-foreground text-xs">{HOME_BLOCK.lead}</p>
            <KeptOnHome />
            <DeviceRoutineReads />
            <ClearHeld
              base={paired.base}
              refresh={() => queryClient.invalidateQueries()}
              state={state}
              blocked={confirmingUnpair}
            />
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
            {/* Always one line: what is typed changes its words, not the
                form's layout (HS1). */}
            <p className="text-muted-foreground truncate text-xs">
              {host === null
                ? "Reads from home once you type its address."
                : `Reads from ${host}`}
            </p>
            {note !== null ? (
              <Notice key={note} dismissible>
                {NOTES[note]}
              </Notice>
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
          {paired ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                link.kind !== "unpaired" || activity.kind !== "idle" || pairOpen
              }
              onClick={() => setPairOpen(true)}
            >
              Pair...
            </Button>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {synced === "" ? "Not synced yet." : `Last sync: ${synced}`}
        </p>
        {pairOpen && !paired ? (
          <PairForm state={state} onCancel={() => setPairOpen(false)} />
        ) : null}
      </div>
    </section>
  )
}
