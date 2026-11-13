import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button, Label, Switch } from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { createSwitchesClient } from "@/lib/home-switches/client"
import type { SwitchKey } from "@/lib/home-switches/model"
import { canSet, SWITCH_KEYS } from "@/lib/home-switches/model"
import type { HomeSwitches } from "@/lib/home-switches/runtime"
import { createHomeSwitches } from "@/lib/home-switches/runtime"
import {
  changeFailed,
  PAGE,
  statusLine,
  SWITCH_WORDS,
} from "@/lib/home-switches/words"

/** One switch's runtime, its failures said over the screen through `sonner`. */
function makeSwitch(key: SwitchKey): HomeSwitches {
  const words = SWITCH_WORDS[key]
  return createHomeSwitches({
    client: createSwitchesClient(key),
    notify: (why, on) => {
      const { title, description } = changeFailed(words, why, on)
      toast.error(title, { description })
    },
  })
}

/** One switch's row: what it does, how it stands, and the switch itself. */
const SwitchRow = ({ switchKey }: { switchKey: SwitchKey }): JSX.Element => {
  // A runtime made once per mount: rows are keyed by their switch, so a row
  // never sees another key, and a cache React may drop would lose a set.
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount, keyed by switch
  const [runtime] = useState(() => makeSwitch(switchKey))
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  useEffect(() => {
    runtime.read()
  }, [runtime])
  const words = SWITCH_WORDS[switchKey]
  const id = `home-switch-${switchKey}`
  const on =
    state.kind === "read" ? (state.setting ?? state.standing.on) : false

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{words.label}</Label>
        <p className="text-muted-foreground text-sm">{words.about}</p>
        <p className="text-sm" aria-live="polite">
          {statusLine(words, state)}
        </p>
        {state.kind === "unread" ? (
          <Button variant="outline" size="sm" onClick={() => runtime.read()}>
            {PAGE.askAgain}
          </Button>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={on}
        disabled={!canSet(state)}
        onCheckedChange={(checked: boolean) => runtime.turn(checked)}
      />
    </div>
  )
}

/**
 * Home's switches: what home does while it runs, set from the desktop web
 * (the administration epic, #2357; never the APK): Rust Rounds recording and
 * whether home follows NFL games. LAN-only and account-only (`_lan.tsx`);
 * home answers only its owner (or the subjects it lists as operators), 401
 * signed out and 403 otherwise, which the page says in
 * `lib/home-switches/words`. Each row reads its own runtime's snapshot, and
 * the page holds no request of its own.
 */
const HomeSwitchesRoute = (): JSX.Element => (
  <section className="flex max-w-2xl flex-col gap-4">
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">{PAGE.title}</h1>
      <p className="text-muted-foreground text-sm">{PAGE.intro}</p>
    </div>
    {SWITCH_KEYS.map((key) => (
      <SwitchRow key={key} switchKey={key} />
    ))}
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/home-switches")({
  component: HomeSwitchesRoute,
})
