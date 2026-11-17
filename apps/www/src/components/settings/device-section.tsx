/**
 * The Android app's Home page (Settings → Home, paulgsc/some-ui#2107): the
 * Home server block, where the phone is paired, signed out (SIGNIN3) and synced, and
 * where a finished session home holds is cleared from the phone (LA8,
 * docs/learner-data-authority.md), each a tap that names where it goes.
 * Everything else the phone keeps goes to home on its own once paired
 * (LA15), and this page says what is kept where and what waits
 * (`./device-kept-on-home`, `./device-routine-reads`). `lib/home-link` owns
 * the work, and this component only shows it.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Button, Input, Label, Notice } from "@some-ui/shared"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { homeApiBase } from "@/lib/device-backend/home-sync"
import type { HomeLinkState } from "@/lib/home-link"
import { homeLink, hostOf, useHomeLink } from "@/lib/home-link"
import { addressOf } from "@/lib/home-link/address"
import type { ClearEnd } from "@/lib/home-link/clear"
import { clearHeld, finishedOnPhone } from "@/lib/home-link/clear"
import { rememberSeen } from "@/lib/home-link/first-run"
import {
  HOME_ADDRESS_KEY,
  remember,
  remembered,
} from "@/lib/home-link/remembered"
import {
  SIGN_OUT,
  signInView,
  UNPAIRED_NOTES,
} from "@/lib/home-link/sign-in-words"
import type { SyncResult } from "@/lib/home-link/sync"
import { lastSync, syncLessonsFrom } from "@/lib/home-link/sync"
import { CLEAR, HOME_BLOCK } from "@/lib/home-link/words"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { KeptOnHome } from "@/components/settings/device-kept-on-home"
import { PairForm } from "@/components/settings/device-pair-form"
import { DeviceRoutineReads } from "@/components/settings/device-routine-reads"

/** A bare address as its host, for "Reads from"; `null` when it is not one. */
function typedHost(address: string): string | null {
  try {
    return hostOf(homeApiBase(address))
  } catch {
    return null
  }
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
  const [address, setAddress] = useState(() => remembered(HOME_ADDRESS_KEY))
  const [pairOpen, setPairOpen] = useState(false)
  const [confirmingUnpair, setConfirmingUnpair] = useState(false)

  const { link, activity } = state
  const paired = link.kind === "paired" ? link : null
  // Home forgot this phone: it may pair again in place (SIGNIN3).
  const forgotten = paired?.standing.kind === "forgotten"
  // The pairing form closes once the link it was opened over changes (a
  // pairing made, or home knowing the phone again), so nothing it held
  // back stays held back with no form on screen.
  const linkKey = paired ? `${paired.id}:${paired.standing.kind}` : link.kind
  const [openedOver, setOpenedOver] = useState(linkKey)
  if (openedOver !== linkKey) {
    setOpenedOver(linkKey)
    setPairOpen(false)
  }
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
              <p className="min-w-0 flex-1 text-sm break-words">
                {signInView(state).line}
              </p>
              <div className="flex flex-wrap gap-2">
                {forgotten ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      activity.kind !== "idle" || confirmingUnpair || pairOpen
                    }
                    onClick={() => setPairOpen(true)}
                  >
                    {SIGN_OUT.pairAgain}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    activity.kind !== "idle" || confirmingUnpair || pairOpen
                  }
                  onClick={() => setConfirmingUnpair(true)}
                >
                  {SIGN_OUT.button}
                </Button>
              </div>
            </div>
            {confirmingUnpair ? (
              <div className="space-y-2">
                <p className="text-sm">{SIGN_OUT.ask(host ?? "")}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {SIGN_OUT.keeps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <IntentButton
                    state={unpair.state}
                    onPress={() => {
                      setConfirmingUnpair(false)
                      // The person signed out on purpose: the first run's
                      // welcome is not for this phone again (SIGNIN2).
                      rememberSeen("unpaired")
                      unpair.start(undefined)
                    }}
                    variant="destructive"
                    size="sm"
                    idleLabel={SIGN_OUT.yes}
                    workingLabel={SIGN_OUT.signingOut}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingUnpair(false)}
                  >
                    {SIGN_OUT.stay}
                  </Button>
                </div>
              </div>
            ) : null}
            {forgotten && pairOpen ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {SIGN_OUT.pairAgainLead}
                </p>
                <PairForm
                  state={state}
                  initialAddress={addressOf(paired.base)}
                  onCancel={() => setPairOpen(false)}
                />
              </div>
            ) : null}
            {paired.notForgotten ? (
              <Notice tone="danger" dismissible>
                {SIGN_OUT.notForgotten}
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
                {UNPAIRED_NOTES[note]}
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
                if (!paired) remember(HOME_ADDRESS_KEY, typed)
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
          <PairForm
            state={state}
            initialAddress={address}
            onCancel={() => setPairOpen(false)}
          />
        ) : null}
      </div>
    </section>
  )
}
