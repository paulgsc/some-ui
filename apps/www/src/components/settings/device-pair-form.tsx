/**
 * The pairing form (SIGNIN2, #3088): the code from the computer, a name for
 * this phone where home takes one (`lib/home-link/naming`, never filled in
 * for the owner), and Pair. The address is the caller's own field, one per
 * screen: Settings › Home's, shared with its sync, or the welcome's.
 * `lib/home-link` does the pairing; this form only asks for it. Its words
 * are `lib/home-link/sign-in-words`' alone.
 */
import type { JSX } from "react"
import { useState } from "react"
import { Button, Input, Label, Notice } from "@some-ui/shared"

import type { HomeLinkState } from "@/lib/home-link"
import { homeLink, hostOf, pairingAddress, typedCode } from "@/lib/home-link"
import type { TypedName } from "@/lib/home-link/naming"
import { PHONE_NAMES, typedName } from "@/lib/home-link/naming"
import { PAIR_FORM, pairFailureLine } from "@/lib/home-link/sign-in-words"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

const NO_NAME: TypedName = { kind: "none" }

export const PairForm = ({
  state,
  address,
  onCancel,
}: {
  state: HomeLinkState
  /** What the screen's address field holds now. */
  address: string
  /** Closes the form; none where the form is the screen's only way on. */
  onCancel?: () => void
}): JSX.Element => {
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
      {read === "not-https" && (
        <Notice tone="warning">{PAIR_FORM.notHttps}</Notice>
      )}
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
          {/* Always one line: what is typed changes its words, not the
              form's layout (HS1). */}
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
