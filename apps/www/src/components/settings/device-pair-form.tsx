/**
 * The pairing form (SIGNIN2, #3088), the one place pairing is asked for,
 * drawn by Settings › Home and the first run's welcome: home's address
 * (started from what the screen hands it), the code from the computer, a
 * name for this phone where home takes one (`lib/home-link/naming`, never
 * filled in for the owner), and Pair. Its address is its own: the sync
 * reads a bare host as plain http, pairing as https (docs/calls/C473.json).
 * `lib/home-link` does the pairing. Its words are
 * `lib/home-link/sign-in-words`' alone.
 */
import type { JSX } from "react"
import { useState } from "react"
import { Button, Input, Label, Notice } from "@some-ui/shared"

import type { HomeLinkState } from "@/lib/home-link"
import { homeLink, hostOf, pairingAddress, typedCode } from "@/lib/home-link"
import { PHONE_NAMES } from "@/lib/home-link/naming"
import { PAIR_FORM, pairFailureLine } from "@/lib/home-link/sign-in-words"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { TypedName } from "@/lib/phone-name"
import { typedName } from "@/lib/phone-name"

const NO_NAME: TypedName = { kind: "none" }

export const PairForm = ({
  state,
  initialAddress,
  onCancel,
}: {
  state: HomeLinkState
  /** The address the form starts from; the person may change it. */
  initialAddress: string
  /** Closes the form; none where the form is the screen's only way on. */
  onCancel?: () => void
}): JSX.Element => {
  const [address, setAddress] = useState(initialAddress)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const read = pairingAddress(address)
  const target = typeof read === "string" ? null : read
  const typed = typedCode(code)
  const named = PHONE_NAMES ? typedName(name) : NO_NAME
  const refused = named.kind === "refused"
  const pairing = state.activity.kind === "pairing"
  const { pairFailure } = state
  const failed =
    pairFailure === null
      ? null
      : pairFailureLine(pairFailure.failure, hostOf(pairFailure.base))
  const pair = useAsyncIntent(
    (variables: {
      target: NonNullable<typeof target>
      code: string
      name: string | undefined
    }) => homeLink().pair(variables.target, variables.code, variables.name),
    { presentation: "interactive" }
  )

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="pair-address">{PAIR_FORM.address}</Label>
      <Input
        id="pair-address"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="file-host.home.example"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      {/* Always one line: what is typed changes its words, not the form's
          layout (HS1). */}
      <p className="text-muted-foreground truncate text-xs">
        {read === "not-https"
          ? PAIR_FORM.notHttps
          : target === null
            ? PAIR_FORM.addressHint
            : PAIR_FORM.homeAt(target.host)}
      </p>
      <Label htmlFor="pair-code">{PAIR_FORM.code}</Label>
      <Input
        id="pair-code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="one-time-code"
        placeholder="K7QF 2M9X"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      {PHONE_NAMES ? (
        <>
          <Label htmlFor="pair-name">{PAIR_FORM.name}</Label>
          <Input
            id="pair-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-muted-foreground truncate text-xs">
            {refused ? PAIR_FORM.nameRefused : PAIR_FORM.nameHint}
          </p>
        </>
      ) : null}
      {/* Pair takes the row's room whatever host it names, so a keystroke
          moves neither it nor Cancel (HS1). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <IntentButton
          state={pair.state}
          onPress={() => {
            if (target && typed && !refused) {
              pair.start({
                target,
                code: typed,
                name: named.kind === "name" ? named.name : undefined,
              })
            }
          }}
          disabled={!target || !typed || refused || pairing}
          size="sm"
          className="w-full"
          idleLabel={
            <span className="min-w-0 truncate">
              {target ? PAIR_FORM.pairWith(target.host) : PAIR_FORM.pair}
            </span>
          }
          workingLabel={PAIR_FORM.pairing}
        />
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {PAIR_FORM.cancel}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {named.kind === "name" ? PAIR_FORM.sendsWithName : PAIR_FORM.sends}
      </p>
      {failed !== null && (
        <Notice key={failed} tone="danger" dismissible>
          {failed}
        </Notice>
      )}
    </div>
  )
}
