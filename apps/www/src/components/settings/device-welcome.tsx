/**
 * The first run's welcome on a phone not paired with home (SIGNIN2,
 * #3088): what home is, where the code comes from, one address and the
 * pairing form, or "Not now", which keeps everything on this phone and is
 * remembered (`lib/home-link/first-run`, docs/calls/C471.json). The foyer
 * draws it in place of the wings while `firstRun` holds; once the phone is
 * paired, or "Not now" is said, the foyer is the foyer again, and the
 * sign-in mark says where the phone is signed in. Its words are
 * `lib/home-link/sign-in-words`' alone.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState } from "react"
import { BrandMark, Button } from "@some-ui/shared"

import type { HomeLinkState } from "@/lib/home-link"
import { useHomeLink } from "@/lib/home-link"
import type { Seen } from "@/lib/home-link/first-run"
import {
  firstRun,
  mayOpen,
  rememberSeen,
  restored,
  seenHere,
} from "@/lib/home-link/first-run"
import { HOME_ADDRESS_KEY, remembered } from "@/lib/home-link/remembered"
import { WELCOME } from "@/lib/home-link/sign-in-words"
import { PairForm } from "@/components/settings/device-pair-form"

export const DeviceWelcome = ({
  state,
  restored,
  onNotNow,
}: {
  state: HomeLinkState
  /** Whether it is for a pairing gone without an unpair. */
  restored: boolean
  onNotNow: () => void
}): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-5">
    <header className="flex items-center gap-3">
      <BrandMark tone="brand" className="size-12 shrink-0" />
      <h1 className="text-2xl font-bold tracking-tight">{WELCOME.title}</h1>
    </header>
    {restored ? <p className="text-sm">{WELCOME.restored}</p> : null}
    <p className="text-muted-foreground text-sm">{WELCOME.lead}</p>
    <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
      {WELCOME.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
    <PairForm state={state} initialAddress={remembered(HOME_ADDRESS_KEY)} />
    <div className="space-y-1">
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={onNotNow}
      >
        {WELCOME.notNow}
      </Button>
      <p className="text-muted-foreground text-xs">{WELCOME.notNowNote}</p>
    </div>
  </div>
)

/**
 * The foyer on the phone: the welcome while `firstRun` holds, else
 * `children` (the wings); nothing while the phone's record is read and the
 * welcome may open (`mayOpen`), so the screen doesn't swap once it is (HS1).
 * Here, beside the device code it reads, so the foyer names it only behind
 * the build's device flag and the web builds carry none of it.
 */
export const DeviceFirstRun = ({
  children,
}: {
  children: ReactNode
}): ReactNode => {
  const state = useHomeLink()
  const [seen, setSeen] = useState<Seen>(seenHere)
  const paired = state.link.kind === "paired"
  // What tells a restore from an unpair once the record is gone: a pairing
  // this phone remembers, and an unpair, which Settings remembers as it is
  // pressed and this keeps once the link says it ended.
  const unpaired =
    state.link.kind === "unpaired" &&
    (state.link.note === "unpaired" || state.link.note === "unpaired-offline")
  useEffect(() => {
    if (paired) rememberSeen("paired")
    else if (unpaired) rememberSeen("unpaired")
  }, [paired, unpaired])
  if (state.link.kind === "reading") return mayOpen(seen) ? null : children
  if (!firstRun(state, seen)) return children
  const lost = restored(state, seen)
  const to = lost ? "restored" : "welcome"
  return (
    <DeviceWelcome
      state={state}
      restored={lost}
      onNotNow={() => {
        rememberSeen(to)
        setSeen(to)
      }}
    />
  )
}
