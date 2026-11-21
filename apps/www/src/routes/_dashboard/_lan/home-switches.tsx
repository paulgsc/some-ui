import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button, Label, Switch } from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { createSwitchesClient } from "@/lib/home-switches/client"
import type {
  SettingKey,
  SettingValue,
  SwitchKey,
} from "@/lib/home-switches/model"
import { canSet, SWITCH_KEYS } from "@/lib/home-switches/model"
import type { HomeSwitches } from "@/lib/home-switches/runtime"
import { createHomeSwitches } from "@/lib/home-switches/runtime"
import { NFL_TEAMS } from "@/lib/home-switches/teams"
import {
  changeFailed,
  GAME_TEAMS,
  PAGE,
  statusLine,
  SWITCH_WORDS,
} from "@/lib/home-switches/words"
import { Chips } from "@/components/chips"

/** One setting's runtime, its failures said over the screen through `sonner`. */
function makeSetting<K extends SettingKey>(key: K): HomeSwitches<K> {
  const words = SWITCH_WORDS[key]
  return createHomeSwitches<K>({
    client: createSwitchesClient(key),
    notify: (why, value: SettingValue[K]) => {
      const { title, description } = changeFailed(words, why, value)
      toast.error(title, { description })
    },
  })
}

/**
 * One setting's runtime, made once per mount and read from home on mount:
 * rows are keyed by their setting, so a row never sees another key, and a
 * cache React may drop would lose a set.
 */
function useSetting<K extends SettingKey>(
  key: K
): readonly [HomeSwitches<K>, ReturnType<HomeSwitches<K>["getSnapshot"]>] {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount, keyed by setting
  const [runtime] = useState(() => makeSetting(key))
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  useEffect(() => {
    runtime.read()
  }, [runtime])
  return [runtime, state]
}

/** "Ask again", where home's answer did not come. */
const AskAgain = ({ onAsk }: { onAsk: () => void }): JSX.Element => (
  <Button variant="outline" size="sm" onClick={onAsk}>
    {PAGE.askAgain}
  </Button>
)

/** One switch's row: what it does, how it stands, and the switch itself. */
const SwitchRow = ({ switchKey }: { switchKey: SwitchKey }): JSX.Element => {
  const [runtime, state] = useSetting(switchKey)
  const words = SWITCH_WORDS[switchKey]
  const id = `home-switch-${switchKey}`
  const on =
    state.kind === "read" ? (state.setting ?? state.standing.value) : false

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{words.label}</Label>
        <p className="text-muted-foreground text-sm">{words.about}</p>
        <p className="text-sm" aria-live="polite">
          {statusLine(words, state)}
        </p>
        {state.kind === "unread" ? (
          <AskAgain onAsk={() => runtime.read()} />
        ) : null}
      </div>
      <Switch
        id={id}
        checked={on}
        disabled={!canSet(state)}
        onCheckedChange={(checked: boolean) => runtime.set(checked)}
      />
    </div>
  )
}

/**
 * The teams followed live (#3329): a chip per team, pressed for each chosen,
 * and "Save" sets the whole list. The choice is the page's own until saved,
 * and starts again from what home follows whenever home's answer changes.
 */
const TeamsRow = (): JSX.Element => {
  const [runtime, state] = useSetting("game-teams")
  const held =
    state.kind === "read" ? (state.setting ?? state.standing.value) : null
  // The page's choice, kept with the value it started from: once home's
  // answer changes (read, saved), the choice is dropped and starts again.
  const [draft, setDraft] = useState<{
    readonly from: ReadonlyArray<string> | null
    readonly teams: ReadonlyArray<string>
  } | null>(null)
  const chosen = draft !== null && draft.from === held ? draft.teams : null
  const picked = chosen ?? held ?? []
  const toggle = (team: string): void => {
    setDraft({
      from: held,
      teams: picked.includes(team)
        ? picked.filter((each) => each !== team)
        : [...picked, team].sort(),
    })
  }
  const settable = canSet(state)

  return (
    <div id="game-teams" className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <Label>{GAME_TEAMS.label}</Label>
        <p className="text-muted-foreground text-sm">{GAME_TEAMS.about}</p>
        <p className="text-sm" aria-live="polite">
          {statusLine(SWITCH_WORDS["game-teams"], state)}
        </p>
        {state.kind === "unread" ? (
          <AskAgain onAsk={() => runtime.read()} />
        ) : null}
      </div>
      <Chips
        label={GAME_TEAMS.group}
        options={NFL_TEAMS.map((team) => [team, team] as const)}
        pressed={(team) => picked.includes(team)}
        onToggle={toggle}
        disabled={() => !settable}
      />
      <Button
        size="sm"
        disabled={!settable || chosen === null}
        onClick={() => {
          if (chosen !== null) runtime.set(chosen)
        }}
      >
        {GAME_TEAMS.save}
      </Button>
    </div>
  )
}

/**
 * Home's switches: what home does while it runs, set from the desktop web
 * (the administration epic, #2357; never built into the APK, whose phone
 * opens it in the browser on the home network, as it does the résumé
 * builder: Game Day links to `#game-teams`, through `lib/home-web`): Rust
 * Rounds recording, whether home follows NFL games, and which teams' games
 * it follows live (#3329). LAN-only and account-only (`_lan.tsx`);
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
    <TeamsRow />
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/home-switches")({
  component: HomeSwitchesRoute,
})
