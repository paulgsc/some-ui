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
import { remember, remembered } from "@/lib/home-link/remembered"
import {
  copySessionsHome,
  lastCopy,
  sessionsOnHome,
  sessionsOnPhone,
} from "@/lib/home-link/sessions"
import type { ToSend } from "@/lib/home-link/shelf"
import { keptOnPhone, lastSend, sendShelfTo } from "@/lib/home-link/shelf"
import type { SyncResult } from "@/lib/home-link/sync"
import { lastSync, syncLessonsFrom } from "@/lib/home-link/sync"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { HomeSessions } from "@/components/settings/device-home-sessions"
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

/** What one confirmed send says and does; see `ConfirmedSend`. */
type SendSpec = {
  /** The first button: it only counts, on this phone. */
  readonly open: string
  readonly count: () => Promise<ToSend>
  /** The confirm, naming what `count` found and the host. */
  readonly ask: (what: string) => string
  readonly go: (total: number) => string
  readonly none: string
  readonly busy: string
  readonly run: () => Promise<SyncResult>
  readonly lastLabel: string
  readonly last: () => string
}

/**
 * A send to home in three taps' worth of steps (LA8): count what is here,
 * a confirm naming that count and the host, then the one button that sends,
 * with Stop while it runs.
 */
const ConfirmedSend = ({
  spec,
  state,
}: {
  spec: SendSpec
  state: HomeLinkState
}): JSX.Element => {
  const { activity } = state
  const count = useAsyncIntent((_: undefined) => spec.count(), {
    presentation: "interactive",
  })
  const run = useAsyncIntent((_: undefined) => spec.run(), {
    presentation: "interactive",
  })
  useIntentEffect(run, say)
  const asking = count.state.status === "succeeded" ? count.state.value : null
  const last = spec.last()

  return (
    <div className="space-y-2">
      {run.state.status === "working" && activity.kind === "sending" ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm">{spec.busy}</p>
          <StopButton stopping={activity.stopping} />
        </div>
      ) : asking === null ? (
        <IntentButton
          state={count.state}
          onPress={() => count.start(undefined)}
          disabled={activity.kind !== "idle"}
          variant="outline"
          size="sm"
          idleLabel={spec.open}
          workingLabel="Counting..."
        />
      ) : asking.total === 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm">{spec.none}</p>
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
          <p className="text-sm break-words">{spec.ask(asking.what)}</p>
          <div className="flex flex-wrap gap-2">
            <IntentButton
              state={run.state}
              onPress={() => {
                count.reset()
                run.start(undefined)
              }}
              disabled={activity.kind !== "idle"}
              size="sm"
              idleLabel={spec.go(asking.total)}
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
      {last === "" ? null : (
        <p className="text-muted-foreground text-xs break-all">
          {spec.lastLabel}: {last}
        </p>
      )}
    </div>
  )
}

function sendsTo(
  base: string,
  refresh: () => unknown
): ReadonlyArray<SendSpec> {
  const host = hostOf(base)
  return [
    {
      open: `Send shelf to ${host}...`,
      count: keptOnPhone,
      ask: (what) =>
        `Send ${what} to ${host}? One with the same name there is replaced; nothing there is deleted.`,
      go: (total) => `Send ${total}`,
      none: "Nothing is kept on this phone to send.",
      busy: `Sending your shelf to ${host}...`,
      run: () => sendShelfTo(base),
      lastLabel: "Last shelf send",
      last: lastSend,
    },
    {
      open: `Copy sessions to ${host}...`,
      count: sessionsOnPhone,
      ask: (what) =>
        `Copy ${what} to ${host}? Each goes once, as its plan, status and times; reflections stay here. Then each finished session ${host} confirms it holds leaves this phone, to free its space; unfinished ones and today's stay. A copy can't be removed from this phone.`,
      go: (total) => `Copy ${total}`,
      none: "No sessions on this phone to copy.",
      busy: `Copying sessions to ${host}...`,
      run: () => copySessionsHome(base, refresh),
      lastLabel: "Last sessions copy",
      last: lastCopy,
    },
  ]
}

/**
 * Home's sessions, read on a tap and browsed here; reading again is another
 * tap (LA8).
 */
const BrowseHome = ({
  base,
  state,
}: {
  base: string
  state: HomeLinkState
}): JSX.Element => {
  const host = hostOf(base)
  const read = useAsyncIntent((_: undefined) => sessionsOnHome(base), {
    presentation: "interactive",
  })
  useIntentEffect(read, (result) => {
    if (!result.ok && result.line !== "") toast.error(result.line)
  })
  const held =
    read.state.status === "succeeded" && read.state.value.ok
      ? read.state.value.sessions
      : null
  return (
    <div className="space-y-2">
      <IntentButton
        state={read.state}
        onPress={() => read.start(undefined)}
        disabled={state.activity.kind !== "idle"}
        variant="outline"
        size="sm"
        idleLabel={
          held === null
            ? `Browse sessions on ${host}`
            : `Read ${host}'s sessions again`
        }
        workingLabel="Reading..."
      />
      {held === null ? null : <HomeSessions sessions={held} host={host} />}
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
          Everything you do here is saved on this phone and works with no
          network. TOPIK lessons come from your home server: sync while
          you&apos;re on the home network, and they stay here for later.
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
              Nothing is sent unless you tap below.
            </p>
            {confirmingUnpair ? null : (
              <>
                {sendsTo(paired.base, () =>
                  queryClient.invalidateQueries()
                ).map((spec) => (
                  <ConfirmedSend key={spec.open} spec={spec} state={state} />
                ))}
                <BrowseHome base={paired.base} state={state} />
              </>
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
