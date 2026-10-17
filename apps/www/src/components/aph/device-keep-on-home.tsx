/**
 * Where aph is kept, on aph's screens in the Android app (LA9,
 * docs/learner-data-authority.md): kept on this phone only, with the offer
 * to keep it on home; or kept on home, with what is synced and what still
 * waits here. Phone-only (`build.paths.ts`); the route hands in aph's store
 * and exchange, since only aph's screens may import `@some-ui/aph`.
 */
import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import type { AphWhere } from "@some-ui/aph"
import { cn, counted } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { CircleCheck, CloudOff, RefreshCw, Smartphone } from "lucide-react"

import type { HomeLinkState } from "@/lib/home-link"
import { hostOf, useHomeLink } from "@/lib/home-link"
import type { AphHomeState, AphKeeping } from "@/lib/home-link/aph"
import { askAph, keepAphOnHome, useAphHome } from "@/lib/home-link/aph"

const changes = (n: number): string => counted(n, "change")

type Line = {
  tone: "ok" | "wait" | "off"
  text: string
  /** Details under it: refusals, hidden entries. */
  more: Array<string>
  action: "keep" | "pair" | "retry" | null
}

/** What the strip says, from where aph is kept, the link, and the last run. */
function lineOf(
  where: Extract<AphWhere, { kind: "home" }>,
  link: HomeLinkState,
  run: AphHomeState
): Line {
  const host =
    link.link.kind === "paired" ? hostOf(link.link.base) : "your home server"
  const waiting = where.unsent
  const more = [
    ...(where.refused.length > 0
      ? [
          `${host} refused ${counted(where.refused.length, "entry", "entries")}, kept here: ${where.refused[0]?.why ?? ""}`,
        ]
      : []),
    ...(where.hidden > 0
      ? [
          `${counted(where.hidden, "entry", "entries")} waiting here clash with ${host}'s record and aren't shown.`,
        ]
      : []),
    ...(!where.pulled && run.last?.kind !== "synced"
      ? [`Until ${host} answers, this shows only what this phone hasn't sent.`]
      : []),
  ]
  const last = run.last
  if (link.link.kind !== "paired" && link.link.kind !== "reading") {
    return {
      tone: "off",
      text: `Kept on home, but this phone isn't paired.${waiting > 0 ? ` ${changes(waiting)} wait here.` : ""}`,
      more,
      action: "pair",
    }
  }
  if (run.running) {
    return { tone: "wait", text: `Syncing with ${host}...`, more, action: null }
  }
  if (last?.kind === "forgotten") {
    return {
      tone: "off",
      text: `${host} no longer knows this phone: unpair and pair again in Settings.`,
      more,
      action: "pair",
    }
  }
  if (last?.kind === "failed") {
    return { tone: "off", text: `${last.why}.`, more, action: "retry" }
  }
  if (waiting > 0) {
    return {
      tone: "wait",
      text: `${changes(waiting)} wait on this phone until ${host} answers.`,
      more,
      action: "retry",
    }
  }
  if (last?.kind === "synced") {
    return {
      tone: "ok",
      text: `On ${host} · synced ${new Date(last.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      more,
      action: null,
    }
  }
  return {
    tone: "wait",
    text: `Kept on ${host}. Not reached yet.`,
    more,
    action: "retry",
  }
}

const TONE: Record<Line["tone"], string> = {
  ok: "text-success",
  wait: "text-muted-foreground",
  off: "text-warning",
}

const ICON = { ok: CircleCheck, wait: RefreshCw, off: CloudOff } as const

/**
 * Where aph is kept, said on every view (LA9). On this phone only, it offers
 * keeping it on home: a first press names what goes and where, the second
 * keeps it there from then on. Kept on home, it says what is synced and what
 * still waits here.
 */
export const DeviceKeepOnHome = ({ aph }: { aph: AphKeeping }): JSX.Element => {
  const where = useSyncExternalStore(aph.store.subscribe, aph.store.where)
  const link = useHomeLink()
  const run = useAphHome(aph)
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)

  if (where.kind === "device") {
    const paired = link.link.kind === "paired" ? link.link : null
    const entries = aph.store.get().entries.length
    return (
      <section
        aria-label="Where aph is kept"
        className="bg-card flex flex-col gap-2 rounded-xl border p-3 text-sm"
      >
        <p className="flex items-start gap-2">
          <Smartphone aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Kept on this phone only: nothing else holds it, so losing the phone
            loses it.
          </span>
        </p>
        {paired === null ? (
          <p className="text-muted-foreground text-xs">
            <Link to="/settings" className="underline">
              Pair this phone with home
            </Link>{" "}
            to keep aph there.
          </p>
        ) : asking ? (
          <div className="flex flex-col gap-2">
            <p className="break-words">
              Send {counted(entries, "entry", "entries")} and the settings to{" "}
              {hostOf(paired.base)}, and keep aph there from now on? This phone
              then keeps only the settings and what {hostOf(paired.base)}{" "}
              hasn&apos;t confirmed, and syncs while aph is open.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setFailed(!keepAphOnHome(aph))
                  setAsking(false)
                }}
              >
                Keep on {hostOf(paired.base)}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAsking(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAsking(true)}
            >
              Keep on {hostOf(paired.base)}...
            </Button>
          </div>
        )}
        {failed ? (
          <p className="text-destructive text-xs" role="status">
            This phone couldn&apos;t make the switch. Nothing changed.
          </p>
        ) : null}
      </section>
    )
  }

  const line = lineOf(where, link, run)
  const Icon = ICON[line.tone]
  return (
    <section
      aria-label="Where aph is kept"
      className="flex flex-col gap-1 px-1 text-xs"
    >
      <p
        className={cn("flex items-center gap-2", TONE[line.tone])}
        role="status"
      >
        <Icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            run.running && "motion-safe:animate-spin"
          )}
        />
        <span className="min-w-0 flex-1 break-words">{line.text}</span>
        {line.action === "retry" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => askAph(aph)}
          >
            Try now
          </Button>
        ) : line.action === "pair" ? (
          <Link to="/settings" className="underline">
            Settings
          </Link>
        ) : null}
      </p>
      {line.more.map((m) => (
        <p key={m} className="text-muted-foreground break-words">
          {m}
        </p>
      ))}
    </section>
  )
}
