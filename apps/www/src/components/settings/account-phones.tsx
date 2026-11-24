/**
 * The phones paired with this account, on the lan web's Settings › Account
 * (SIGNIN7, #3095): each by its name, when it paired and when it was last
 * used, with Rename and Sign out. Signing one out asks first and says what
 * stays: the phone keeps what it holds, and home keeps what it sent. The
 * list, and which answer counts, is `lib/auth/phones`'; this draws it.
 * Nothing shows where there is no home to ask (Pages).
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button, Input, Label, Notice, Reading } from "@some-ui/shared"

import type { Phone, PhonesState } from "@/lib/auth/phones/model"
import { phonesOf } from "@/lib/auth/phones/model"
import type { Phones } from "@/lib/auth/phones/runtime"
import { phoneName, PHONES } from "@/lib/auth/phones/words"
import { typedName } from "@/lib/phone-name"

/**
 * Moves focus to what a press just showed in place of the button pressed,
 * which is gone, so a keyboard keeps its place.
 */
const takeFocus = (node: HTMLElement | null): void => {
  node?.focus()
}

const PhoneRow = ({
  phone,
  state,
  phones,
}: {
  phone: Phone
  state: PhonesState
  phones: Phones
}): JSX.Element => {
  const { doing } = state
  const mine = doing.kind !== "idle" && doing.id === phone.id
  const busy = doing.kind !== "idle"

  if (mine && (doing.kind === "naming" || doing.kind === "saving")) {
    const text = doing.kind === "naming" ? doing.text : (doing.name ?? "")
    const typed = typedName(text)
    const refused = typed.kind === "refused"
    const inputId = `phone-name-${phone.id}`
    const save = (): void => {
      if (doing.kind === "naming" && !refused) {
        phones.save(typed.kind === "name" ? typed.name : null)
      }
    }
    return (
      <li>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Label htmlFor={inputId}>{PHONES.nameLabel}</Label>
          <Input
            id={inputId}
            autoComplete="off"
            // The field the owner just asked for: focus goes with their
            // press, never on a page load (it appears only after one).
            ref={takeFocus}
            value={text}
            // Read-only, not disabled, while it saves: the field keeps focus,
            // so a name home refused is there to fix where the keys are.
            readOnly={doing.kind === "saving"}
            onChange={(event) => phones.typed(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {refused ? PHONES.nameRefused : PHONES.nameHint}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={doing.kind === "saving" || refused}
            >
              {doing.kind === "saving" ? PHONES.saving : PHONES.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={doing.kind === "saving"}
              onClick={phones.cancel}
            >
              {PHONES.cancel}
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="space-y-2">
      <div>
        <p className="text-sm font-medium break-words">{phoneName(phone)}</p>
        <p className="text-muted-foreground text-xs">
          {PHONES.paired(phone.pairedOn)} · {PHONES.used(phone.renewedAt)}
        </p>
      </div>
      {mine && (doing.kind === "confirming" || doing.kind === "signingOut") ? (
        <div className="space-y-2">
          <p className="text-sm">{PHONES.confirm(phone)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              // The question the owner's press just asked: focus goes there.
              ref={takeFocus}
              disabled={doing.kind === "signingOut"}
              onClick={phones.confirm}
            >
              {doing.kind === "signingOut"
                ? PHONES.signingOut
                : PHONES.confirmYes}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={doing.kind === "signingOut"}
              onClick={phones.cancel}
            >
              {PHONES.confirmNo}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => phones.renamePressed(phone.id)}
          >
            {PHONES.rename}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => phones.signOutPressed(phone.id)}
          >
            {PHONES.signOut}
          </Button>
        </div>
      )}
    </li>
  )
}

/** The list over `make`'s runtime, read once as it mounts. */
export const AccountPhones = ({
  make,
}: {
  /** Makes the runtime; called once per mount. */
  make: () => Phones
}): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount */
  const [phones] = useState(make)
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => {
    phones.read()
  }, [phones])
  const state = useSyncExternalStore(phones.subscribe, phones.getSnapshot)
  const { list, said } = state
  const shown = phonesOf(list)

  return (
    <div className="space-y-3">
      {list.kind === "reading" ? <Reading>{PHONES.reading}</Reading> : null}
      {list.kind === "unread" ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {list.signedOut
              ? PHONES.signedOutHere
              : shown === null
                ? PHONES.unreadNone
                : PHONES.unreadSome}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={phones.read}
          >
            {PHONES.tryAgain}
          </Button>
        </div>
      ) : null}
      {shown !== null && shown.length === 0 && list.kind === "read" ? (
        <p className="text-muted-foreground text-sm">{PHONES.none}</p>
      ) : null}
      {shown !== null && shown.length > 0 ? (
        <ul className="space-y-4" aria-label={PHONES.list}>
          {shown.map((phone) => (
            <PhoneRow
              key={phone.id}
              phone={phone}
              state={state}
              phones={phones}
            />
          ))}
        </ul>
      ) : null}
      {said === null ? null : (
        <Notice
          key={PHONES.said(said)}
          tone={
            said.kind === "named" || said.kind === "signedOut"
              ? "neutral"
              : "warning"
          }
          onDismiss={phones.dismiss}
        >
          {PHONES.said(said)}
        </Notice>
      )}
    </div>
  )
}
