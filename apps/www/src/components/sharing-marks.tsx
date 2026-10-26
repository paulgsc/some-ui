/**
 * The sharing mark's two axes (`lib/sharing-marks`): where a
 * record is kept, and how its last exchange with home went, each a mark of
 * its own, and their legend. Drawn by the header's mark and by the status
 * page; it reads nothing and sends nothing.
 */
import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { MarkLegend } from "@some-ui/shared"
import type { LucideIcon } from "lucide-react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CircleX,
  Ellipsis,
  HardDrive,
  Hourglass,
  TriangleAlert,
  Unlink,
  Unplug,
  WifiOff,
} from "lucide-react"

import type { How, Where } from "@/lib/sharing-marks"
import { HOW_ORDER, MARK_WORDS, WHERE_ORDER } from "@/lib/sharing-marks"

const HOUSE = "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"

/**
 * Where a record is kept, each in a form of its own: a phone for only here, a
 * dashed house for partly, a house for kept, a house holding a phone for on
 * home and not sent any more, and a dotted ring while it isn't known yet.
 */
export const WhereMark = ({
  where,
  className,
}: {
  where: Where
  className?: string
}): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    data-where={where}
    className={className}
  >
    {where === "phone" ? (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </>
    ) : where === "checking" ? (
      <circle cx="12" cy="12" r="8" strokeDasharray="0.1 3.6" />
    ) : (
      <path
        d={HOUSE}
        strokeDasharray={where === "partly" ? "3 2.4" : undefined}
      />
    )}
    {where === "away" ? (
      <rect x="10" y="12" width="4" height="6.5" rx="0.8" />
    ) : null}
  </svg>
)

/** How the last exchange went, drawn beside where. */
const HOW_ICONS: Readonly<Record<How, LucideIcon>> = {
  current: Check,
  waiting: ArrowUp,
  sending: Ellipsis,
  bringing: ArrowDown,
  "no-answer": WifiOff,
  busy: Hourglass,
  forgotten: Unlink,
  unpaired: Unplug,
  full: Archive,
  "no-room": HardDrive,
  refused: Ban,
  fault: TriangleAlert,
  failed: CircleX,
}

export const HowMark = ({
  how,
  className,
}: {
  how: How
  className?: string
}): JSX.Element => {
  const Icon = HOW_ICONS[how]
  return <Icon aria-hidden data-how={how} className={className} />
}

export const WHERE_TONE: Record<Where, string> = {
  checking: "text-muted-foreground",
  phone: "text-muted-foreground",
  partly: "text-muted-foreground",
  kept: "text-success",
  away: "text-success",
}

export const HOW_TONE: Record<How, string> = {
  current: "text-success",
  waiting: "text-success",
  sending: "text-success",
  bringing: "text-success",
  "no-answer": "text-warning",
  busy: "text-warning",
  forgotten: "text-warning",
  unpaired: "text-warning",
  full: "text-warning",
  "no-room": "text-warning",
  refused: "text-warning",
  fault: "text-warning",
  failed: "text-warning",
}

/** The tone a lane's words wear: how it went, if that says anything. */
export const toneOf = (where: Where, how: How | null): string =>
  how === null ? WHERE_TONE[where] : HOW_TONE[how]

/** Marks a lane can show: away and bringing back only where it can stop short. */
const shown = (
  away: boolean
): { where: ReadonlyArray<Where>; how: ReadonlyArray<How> } =>
  away
    ? { where: WHERE_ORDER, how: HOW_ORDER }
    : {
        where: WHERE_ORDER.filter((w) => w !== "away"),
        how: HOW_ORDER.filter((h) => h !== "bringing"),
      }

/**
 * Every mark a lane can show, and what each means; `away` where the lane
 * can stop short and come back (aph).
 */
export const SharingLegend = ({
  away,
  title = MARK_WORDS.title,
  className,
}: {
  away: boolean
  /** Its heading, where the page already says what the marks are. */
  title?: string
  className?: string
}): JSX.Element => {
  const { where, how } = shown(away)
  return (
    <MarkLegend
      title={title}
      className={className}
      lines={[
        ...where.map((w) => ({
          key: w,
          mark: (
            <WhereMark
              where={w}
              className={cn("size-5 shrink-0", WHERE_TONE[w])}
            />
          ),
          text: MARK_WORDS.where[w],
        })),
        ...how.map((h) => ({
          key: h,
          mark: (
            <HowMark how={h} className={cn("size-5 shrink-0", HOW_TONE[h])} />
          ),
          text: MARK_WORDS.how[h],
        })),
      ]}
    />
  )
}
