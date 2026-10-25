/**
 * A card's title bar that wears a state (`StatusBar`): the state's color
 * across the bar, and at its right the stop it is at, badged "!" when
 * stopped and checked when read. Pressing the icon opens a pop-up with the
 * state's words, its road, and every state, its own picked out; it closes on
 * any press or focus elsewhere, and on Escape (Radix's popover). When the
 * state changes, the bar's color moves with it; nothing loops. Colors come
 * from the theme's tokens, so each holds in every theme.
 */
import type { JSX, ReactNode } from "react"
import { useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Popover, PopoverContent, PopoverTrigger } from "@some-ui/shared"
import type { LucideIcon } from "lucide-react"
import { Check, Folder, House, Inbox, Smartphone, Sunrise } from "lucide-react"

import type {
  Journey,
  JourneyTheme,
  Leg,
  Mark,
  Noun,
  Road,
  Said,
  Stop,
} from "@/lib/journey"
import {
  everyState,
  iconLabel,
  JOURNEY_IDS,
  journeySaid,
  roadOf,
  roadSaid,
  stateTitle,
  STOP_NAMES,
  stopOf,
  themeOf,
} from "@/lib/journey"

const STOP_ICONS: Readonly<Record<Stop, LucideIcon>> = {
  phone: Smartphone,
  home: House,
  mailbox: Inbox,
  drive: Folder,
  run: Sunrise,
}

/** Each kind of state's colors: the bar, the icon's chip, the list's swatch. */
const THEMES: Readonly<
  Record<JourneyTheme, { bar: string; chip: string; swatch: string }>
> = {
  waiting: {
    bar: "bg-muted border-border",
    chip: "bg-background text-foreground border border-border",
    swatch: "bg-muted-foreground",
  },
  moving: {
    bar: "bg-warning/10 border-warning/40",
    chip: "bg-warning text-warning-foreground",
    swatch: "bg-warning",
  },
  read: {
    bar: "bg-success/10 border-success/30",
    chip: "bg-success text-success-foreground",
    swatch: "bg-success",
  },
  // Not `destructive-foreground`: in the dark theme that pair is under 3:1
  // for an icon (`tests/ui-fit/jobs-status-fit.spec.ts`).
  stopped: {
    bar: "bg-destructive/10 border-destructive/40",
    chip: "bg-destructive text-background",
    swatch: "bg-destructive",
  },
}

const MARKS: Readonly<Record<Mark, string>> = {
  reached: "bg-primary text-primary-foreground border-primary",
  stopped: "bg-background text-destructive border-destructive",
  unconfirmed: "bg-background text-warning border-dashed border-warning",
  ahead: "bg-background text-muted-foreground border-border",
}

const LEGS: Readonly<Record<Leg, string>> = {
  passed: "border-primary",
  "under-way": "border-dashed border-warning",
  broken: "border-dashed border-destructive",
  ahead: "border-border",
}

/** The "!" of a stop, or the check of a read, at an icon's corner. */
const CornerBadge = ({
  tone,
  children,
}: {
  tone: string
  children: ReactNode
}): JSX.Element => (
  <span
    aria-hidden
    className={cn(
      "absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full text-[0.625rem] font-bold",
      tone
    )}
  >
    {children}
  </span>
)

/** The whole road: each stop, and the way between them. */
const JourneyTrack = ({ road }: { road: Road }): JSX.Element => (
  <div
    role="img"
    aria-label={roadSaid(road)}
    className="flex flex-col gap-1 px-2 py-1"
    data-journey-track=""
  >
    <div className="flex items-center">
      {road.stops.map((stop, i) => {
        const Icon = STOP_ICONS[stop]
        const mark = road.marks[i] ?? "ahead"
        const leg = i > 0 ? road.legs[i - 1] : undefined
        return (
          <span key={stop} className="contents">
            {leg !== undefined && (
              <span
                aria-hidden
                className={cn("min-w-3 flex-1 border-t-2", LEGS[leg])}
              />
            )}
            <span
              aria-hidden
              data-mark={mark}
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                MARKS[mark]
              )}
            >
              <Icon className="size-3.5" />
              {mark === "stopped" && (
                <CornerBadge tone="bg-destructive text-background">
                  !
                </CornerBadge>
              )}
            </span>
          </span>
        )
      })}
    </div>
    <div aria-hidden className="flex justify-between">
      {road.stops.map((stop) => (
        <span
          key={stop}
          className="text-muted-foreground flex w-7 justify-center whitespace-nowrap text-[0.6875rem] font-medium"
        >
          {STOP_NAMES[stop]}
        </span>
      ))}
    </div>
  </div>
)

/** One state of a closed set, as the pop-up's list names it. */
type Listed = {
  readonly id: string
  readonly title: string
  readonly theme: JourneyTheme
}

/** The pop-up's list: every state, the card's own picked out. */
const EveryState = ({
  current,
  every,
}: {
  current: string
  every: ReadonlyArray<Listed>
}): JSX.Element => (
  <div className="flex flex-col gap-1 border-t pt-2">
    <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
      {everyState}
    </span>
    <ul className="flex flex-col gap-0.5">
      {every.map(({ id, title, theme }) => (
        <li
          key={id}
          aria-current={id === current ? "true" : undefined}
          className={cn(
            "grid grid-cols-[0.625rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 text-[0.8125rem] leading-snug",
            id === current && "bg-muted font-semibold"
          )}
        >
          <span
            aria-hidden
            className={cn("size-2.5 rounded-sm", THEMES[theme].swatch)}
          />
          <span className="break-words">{title}</span>
        </li>
      ))}
    </ul>
  </div>
)

/** A state as a bar wears it. */
export type BarState = {
  readonly id: string
  readonly theme: JourneyTheme
  /** The stop its icon shows. */
  readonly at: Stop
  readonly said: Said
  /** The icon's spoken name. */
  readonly label: string
  readonly road: Road
  /** Every state of its set, for the pop-up's list. */
  readonly every: ReadonlyArray<Listed>
}

export type StatusBarProps = {
  /** The card's name. */
  title: ReactNode
  /** The state it wears; null before there is one. */
  state: BarState | null
  /** The heading the title is, under the screen's own. */
  heading?: "h2" | "h3" | undefined
  /** What the pop-up shows under the road, before every state. */
  more?: ReactNode
  className?: string | undefined
}

/** A card's title bar, wearing `state`. */
const StatusBar = ({
  title,
  state,
  heading: Heading = "h2",
  more,
  className,
}: StatusBarProps): JSX.Element => {
  const trigger = useRef<HTMLButtonElement>(null)
  // Toward the larger half of the window, so a card low on a phone held
  // sideways opens upward rather than into the strip below it.
  const [side, setSide] = useState<"top" | "bottom">("bottom")
  const aim = (open: boolean): void => {
    const box = trigger.current?.getBoundingClientRect()
    if (!open || box === undefined) return
    setSide(
      box.top + box.height / 2 > window.innerHeight / 2 ? "top" : "bottom"
    )
  }
  const Icon = state === null ? null : STOP_ICONS[state.at]
  return (
    <div
      data-journey={state?.id ?? "none"}
      data-journey-theme={state?.theme ?? "none"}
      className={cn(
        "flex min-h-13 items-center justify-between gap-2 rounded-t-xl border-b py-1 pl-3.5 pr-1 transition-colors duration-200 motion-reduce:transition-none",
        state === null ? "bg-muted/40 border-border" : THEMES[state.theme].bar,
        className
      )}
    >
      <Heading className="min-w-0 break-words text-base font-semibold">
        {title}
      </Heading>
      {state !== null && Icon && (
        <Popover onOpenChange={aim}>
          <PopoverTrigger asChild>
            <button
              ref={trigger}
              type="button"
              aria-label={state.label}
              className="focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2"
            >
              <span
                data-journey-chip=""
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-lg transition-colors duration-200 motion-reduce:transition-none",
                  THEMES[state.theme].chip
                )}
              >
                <Icon aria-hidden className="size-4.5" />
                {state.theme === "stopped" && (
                  <CornerBadge tone="bg-background text-destructive border border-destructive">
                    !
                  </CornerBadge>
                )}
                {state.theme === "read" && (
                  <CornerBadge tone="bg-background text-success border border-success">
                    <Check className="size-2.5" strokeWidth={3} />
                  </CornerBadge>
                )}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side={side}
            align="end"
            collisionPadding={16}
            aria-label={state.said.title}
            data-journey-popup=""
            data-scroll-intent=""
            className={
              // scroll-intent: the words, the road and every state stay
              // whole; on a phone held sideways the box is shorter than
              // they are, and it scrolls inside the window rather than
              // leaving it.
              "flex max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[min(19rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto p-3"
            }
          >
            <span className="break-words text-[0.9375rem] font-semibold">
              {state.said.title}
            </span>
            <span className="text-muted-foreground break-words text-sm leading-snug">
              {state.said.line}
            </span>
            <div className="flex justify-center">
              <JourneyTrack road={state.road} />
            </div>
            {more}
            <EveryState current={state.id} every={state.every} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/** A card whose title bar wears `state`, and what it holds. */
export const StatusCard = ({
  children,
  ...bar
}: StatusBarProps & { children?: ReactNode }): JSX.Element => (
  <section className="flex flex-col rounded-xl border">
    <StatusBar {...bar} />
    {children}
  </section>
)

/** Where a file is (J0), as a bar wears it; null before anything was offered. */
export function journeyBarState(
  journey: Journey | null,
  noun: Noun,
  now: Date
): BarState | null {
  if (journey === null) return null
  const said = journeySaid(journey, noun, now)
  return {
    id: journey.id,
    theme: themeOf(journey.id),
    at: stopOf(journey.id),
    said,
    label: iconLabel(said, noun),
    road: roadOf(journey),
    every: JOURNEY_IDS.map((id) => ({
      id,
      title: stateTitle(id, noun),
      theme: themeOf(id),
    })),
  }
}

export type JourneyStatusProps = {
  /** The card's name: what the file holds. */
  title: ReactNode
  /** Where its file is; null before anything was offered. */
  journey: Journey | null
  noun: Noun
  /** The heading the title is, under the screen's own. */
  heading?: "h2" | "h3" | undefined
  /** The time its words are said at; now by default. */
  now?: Date | undefined
  className?: string | undefined
}

/** A card's title bar, wearing where its file is (J0). */
export const JourneyStatus = ({
  journey,
  noun,
  now = new Date(),
  ...bar
}: JourneyStatusProps): JSX.Element => (
  <StatusBar {...bar} state={journeyBarState(journey, noun, now)} />
)
