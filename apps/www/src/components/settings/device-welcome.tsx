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
import { useState } from "react"
import { BrandMark, Button, Input, Label } from "@some-ui/shared"

import type { HomeLinkState } from "@/lib/home-link"
import { pairingAddress, useHomeLink } from "@/lib/home-link"
import type { NotNow } from "@/lib/home-link/first-run"
import { firstRun, saidNotNow, sayNotNow } from "@/lib/home-link/first-run"
import { HOME_ADDRESS_KEY, remembered } from "@/lib/home-link/remembered"
import { PAIR_FORM, WELCOME } from "@/lib/home-link/sign-in-words"
import { PairForm } from "@/components/settings/device-pair-form"

export const DeviceWelcome = ({
  state,
  onNotNow,
}: {
  state: HomeLinkState
  onNotNow: () => void
}): JSX.Element => {
  const [address, setAddress] = useState(() => remembered(HOME_ADDRESS_KEY))
  const read = pairingAddress(address)
  const restored = state.link.kind === "unpaired" && state.link.note === "lost"

  return (
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
      <div className="space-y-2">
        <Label htmlFor="welcome-address">{PAIR_FORM.address}</Label>
        <Input
          id="welcome-address"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="file-host.home.example"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        {/* Always one line: what is typed changes its words, not the
            screen's layout (HS1). */}
        <p className="text-muted-foreground truncate text-xs">
          {typeof read === "string"
            ? PAIR_FORM.addressHint
            : PAIR_FORM.homeAt(read.host)}
        </p>
      </div>
      <PairForm state={state} address={address} />
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
}

/**
 * The foyer on the phone: the welcome while `firstRun` holds, else
 * `children` (the wings). Kept here, beside the device code it reads, so
 * the foyer route names it only behind the build's device flag and the web
 * builds carry none of it (build.paths.ts).
 */
export const DeviceFirstRun = ({
  children,
}: {
  children: ReactNode
}): ReactNode => {
  const state = useHomeLink()
  const [notNow, setNotNow] = useState<NotNow>(saidNotNow)
  if (!firstRun(state, notNow)) return children
  const to =
    state.link.kind === "unpaired" && state.link.note === "lost"
      ? "restored"
      : "welcome"
  return (
    <DeviceWelcome
      state={state}
      onNotNow={() => {
        sayNotNow(to)
        setNotNow(to)
      }}
    />
  )
}
