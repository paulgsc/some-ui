/**
 * Where a record is kept, in the Android app, for a record its person may
 * keep on home (aph, LA9; the Jobs record, LA10;
 * docs/learner-data-authority.md): kept on this phone only, with the offer
 * to keep it on home; or kept on home, with what is synced and what still
 * waits here. Each record's own strip says what goes and runs its lane
 * (`components/aph/device-keep-on-home.tsx`, `components/jobs/keep-on-home.tsx`).
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import { cn, counted } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { CircleCheck, CloudOff, RefreshCw, Smartphone } from "lucide-react"

import type { HomeLinkState } from "@/lib/home-link"
import { homeLink, hostOf, useHomeLink } from "@/lib/home-link"
import type { KeptState } from "@/lib/home-link/kept-model"

/** A record kept on home, as the strip shows it. */
type KeptView = {
  /** Its changes not yet sent, or not yet confirmed. */
  waiting: number
  /** Lines under the status, given the paired host. */
  more: (host: string) => Array<string>
}

export type KeepOnHomeProps = {
  /** The section's name: "Where aph is kept". */
  label: string
  /** What the record is called in the strip's sentences: "aph". */
  name: string
  /** The record kept on home, or null while it is on this phone only. */
  kept: KeptView | null
  run: KeptState
  /** The first press's question, naming what goes to `host`. */
  offer: (host: string) => ReactNode
  /** The second press; false when the phone would not keep the switch. */
  keep: () => boolean
  ask: () => void
}

type Line = {
  tone: "ok" | "wait" | "off"
  text: string
  action: "pair" | "retry" | "stop" | null
}

const changes = (n: number): string => counted(n, "change")

/** What the strip says, from what waits, the link, and the last run. */
function lineOf(waiting: number, link: HomeLinkState, run: KeptState): Line {
  const host =
    link.link.kind === "paired" ? hostOf(link.link.base) : "your home server"
  const last = run.last
  if (link.link.kind !== "paired" && link.link.kind !== "reading") {
    return {
      tone: "off",
      text: `Kept on home, but this phone isn't paired.${waiting > 0 ? ` ${changes(waiting)} wait here.` : ""}`,
      action: "pair",
    }
  }
  if (run.running) {
    return { tone: "wait", text: `Syncing with ${host}...`, action: "stop" }
  }
  if (last?.kind === "forgotten") {
    return {
      tone: "off",
      text: `${host} no longer knows this phone: unpair and pair again in Settings.`,
      action: "pair",
    }
  }
  if (last?.kind === "failed") {
    return { tone: "off", text: `${last.why}.`, action: "retry" }
  }
  if (waiting > 0) {
    return {
      tone: "wait",
      text: `${changes(waiting)} wait on this phone until ${host} answers.`,
      action: "retry",
    }
  }
  if (last?.kind === "synced") {
    return {
      tone: "ok",
      text: `On ${host} · synced ${new Date(last.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      action: null,
    }
  }
  return {
    tone: "wait",
    text: `Kept on ${host}. Not reached yet.`,
    action: "retry",
  }
}

const TONE: Record<Line["tone"], string> = {
  ok: "text-success",
  wait: "text-muted-foreground",
  off: "text-warning",
}

const ICON = { ok: CircleCheck, wait: RefreshCw, off: CloudOff } as const

/** The first press names what goes and where; the second keeps it there. */
export const KeepOnHome = ({
  label,
  name,
  kept,
  run,
  offer,
  keep,
  ask,
}: KeepOnHomeProps): JSX.Element => {
  const link = useHomeLink()
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)

  if (kept === null) {
    const paired = link.link.kind === "paired" ? link.link : null
    return (
      <section
        aria-label={label}
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
            to keep {name} there.
          </p>
        ) : asking ? (
          <div className="flex flex-col gap-2">
            <p className="break-words">{offer(hostOf(paired.base))}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setFailed(!keep())
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

  const line = lineOf(kept.waiting, link, run)
  const host =
    link.link.kind === "paired" ? hostOf(link.link.base) : "your home server"
  const Icon = ICON[line.tone]
  return (
    <section aria-label={label} className="flex flex-col gap-1 px-1 text-xs">
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
        {line.action === "stop" && link.activity.kind === "keeping" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={link.activity.stopping}
            onClick={() => homeLink().stop()}
          >
            {link.activity.stopping ? "Stopping..." : "Stop"}
          </Button>
        ) : line.action === "retry" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={ask}
          >
            Try now
          </Button>
        ) : line.action === "pair" ? (
          <Link to="/settings" className="underline">
            Settings
          </Link>
        ) : null}
      </p>
      {kept.more(host).map((m) => (
        <p key={m} className="text-muted-foreground break-words">
          {m}
        </p>
      ))}
    </section>
  )
}
