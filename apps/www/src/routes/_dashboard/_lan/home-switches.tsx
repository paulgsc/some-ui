import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button, Label, Switch } from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { createSwitchesClient } from "@/lib/home-switches/client"
import { canSet } from "@/lib/home-switches/model"
import type { HomeSwitches } from "@/lib/home-switches/runtime"
import { createHomeSwitches } from "@/lib/home-switches/runtime"
import {
  changeFailed,
  PAGE,
  RUST_ROUNDS,
  statusLine,
} from "@/lib/home-switches/words"

/** The runtime, its failures said over the screen through `sonner`. */
function makeSwitches(): HomeSwitches {
  return createHomeSwitches({
    client: createSwitchesClient(),
    notify: (why, recording) => {
      const { title, description } = changeFailed(why, recording)
      toast.error(title, { description })
    },
  })
}

/**
 * Home's switches: what home does while it runs, set from the desktop web
 * (the administration epic, #2357; never the APK). One today, Rust Rounds
 * recording. LAN-only and account-only (`_lan.tsx`); home answers only its
 * owner (or the subjects it lists as operators), 401 signed out and 403
 * otherwise, which the page says in `lib/home-switches/words`. The page reads
 * the runtime's snapshot and holds no request of its own.
 */
const HomeSwitchesRoute = (): JSX.Element => {
  const [switches] = useState(makeSwitches)
  const state = useSyncExternalStore(switches.subscribe, switches.getSnapshot)
  useEffect(() => {
    switches.read()
  }, [switches])

  const recording =
    state.kind === "read" ? (state.setting ?? state.standing.recording) : false

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{PAGE.title}</h1>
        <p className="text-muted-foreground text-sm">{PAGE.intro}</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="rust-rounds-recording">{RUST_ROUNDS.label}</Label>
          <p className="text-muted-foreground text-sm">{RUST_ROUNDS.about}</p>
          <p className="text-sm" aria-live="polite">
            {statusLine(state)}
          </p>
          {state.kind === "unread" ? (
            <Button variant="outline" size="sm" onClick={() => switches.read()}>
              {PAGE.askAgain}
            </Button>
          ) : null}
        </div>
        <Switch
          id="rust-rounds-recording"
          checked={recording}
          disabled={!canSet(state)}
          onCheckedChange={(checked: boolean) => switches.turn(checked)}
        />
      </div>
    </section>
  )
}

export const Route = createFileRoute("/_dashboard/_lan/home-switches")({
  component: HomeSwitchesRoute,
})
