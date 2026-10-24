/**
 * "What are you hungry for?" on the handheld (`core/portion`): a portion and
 * a freshness, then one dish of that size cut from what the phone holds,
 * with a way to start it, another like it, or a new order. Which dish is
 * served is `serve`'s alone, and its words `PORTION_WORDS`' alone; this
 * keeps only which screen is up and what was served for the order.
 */

import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type {
  Dish,
  Fresh,
  Freshness,
  Holdings,
  Order,
  Portion,
} from "@topik/lib/topik/core/portion"
import {
  FRESHNESS,
  isLines,
  PORTION_WORDS,
  PORTIONS,
  serve,
  servedAfter,
} from "@topik/lib/topik/core/portion"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"

/** Each portion's mark grows with it: a dot, a bowl, a plate, a sparkle. */
const PORTION_SIZE: Record<Portion, string> = {
  bite: "size-6",
  snack: "size-7",
  meal: "size-9",
  dessert: "size-7",
}

export const PortionMark = ({
  portion,
  className,
}: {
  portion: Portion
  className?: string
}): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinejoin="round"
    aria-hidden
    data-portion={portion}
    className={className}
  >
    {portion === "bite" ? (
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    ) : null}
    {portion === "snack" ? <path d="M4 11h16a8 8 0 0 1-16 0z" /> : null}
    {portion === "meal" ? (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
      </>
    ) : null}
    {portion === "dessert" ? (
      <path d="M12 3.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2z" />
    ) : null}
  </svg>
)

const FRESH_TONE: Record<Fresh["kind"], string> = {
  new: "text-primary",
  seen: "text-muted-foreground",
  due: "text-warning",
}

/** A hollow ring for new, two dots for seen, a turn back for due again. */
const FreshMark = ({
  kind,
  className,
}: {
  kind: Fresh["kind"]
  className?: string
}): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    aria-hidden
    data-fresh={kind}
    className={className}
  >
    {kind === "new" ? <circle cx="12" cy="12" r="5.5" /> : null}
    {kind === "seen" ? (
      <>
        <circle cx="7.5" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="12" r="2" fill="currentColor" stroke="none" />
      </>
    ) : null}
    {kind === "due" ? (
      <>
        <path d="M5.5 12a6.5 6.5 0 1 0 1.9-4.6" />
        <path d="M6.5 4.5v3.4h3.4" />
      </>
    ) : null}
  </svg>
)

/** The freshness choices' marks; "either" has none. */
const CHOICE_MARK: Record<Freshness, Fresh["kind"] | null> = {
  new: "new",
  seen: "seen",
  either: null,
}

/** The Korean on a dish's card, and the English under it. */
function faceOf(dish: Dish): { korean: string; english: string } {
  return isLines(dish)
    ? {
        korean: dish.lines.map((line) => line.korean).join(" "),
        english: dish.lines.map((line) => line.english).join(" "),
      }
    : { korean: dish.title, english: "" }
}

/** The question screen: a portion, then fresh or familiar. */
export const PortionAsk = ({
  order,
  onOrder,
  onServe,
  short = false,
}: {
  order: Order
  onOrder: (order: Order) => void
  onServe: () => void
  /** Landscape phone: compact chrome. */
  short?: boolean
}): JSX.Element => (
  <div
    data-slot="topik-portion-menu"
    data-scroll-intent="long-form"
    className={cn(
      // scroll-intent: long-form — a phone with large text can still run
      // the portions and the button under them past the screen, and a
      // thumb scrolls them as it does the material list.
      "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
      short ? "gap-2" : "gap-3.5"
    )}
  >
    <h2
      className={cn(
        "mx-1 leading-snug font-bold",
        short ? "text-xl" : "text-2xl"
      )}
    >
      {PORTION_WORDS.title}
    </h2>
    <p className="text-muted-foreground mx-1 text-[15px] leading-normal">
      {PORTION_WORDS.lead}
    </p>
    <div
      role="radiogroup"
      aria-label={PORTION_WORDS.portionGroup}
      // Sideways, the four sit in one row so the button stays on screen.
      className={cn("grid gap-2.5", short ? "grid-cols-4" : "grid-cols-2")}
    >
      {PORTIONS.map((portion) => {
        const words = PORTION_WORDS.portions[portion]
        const chosen = order.portion === portion
        return (
          <button
            key={portion}
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={`${words.en}: ${words.hint}`}
            onClick={() => onOrder({ ...order, portion })}
            className={cn(
              "flex rounded-2xl border-[1.5px] text-left",
              short
                ? "items-center gap-2 p-2.5"
                : "min-h-32 flex-col justify-between gap-2 p-3.5",
              chosen ? "border-primary bg-primary/10" : "border-border bg-card"
            )}
          >
            <PortionMark
              portion={portion}
              className={cn("text-primary shrink-0", PORTION_SIZE[portion])}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span lang="ko" className="text-[17px] font-bold">
                {words.ko}
              </span>
              <span className="text-sm font-medium">{words.en}</span>
              <span className="text-muted-foreground text-[13px]">
                {words.hint}
              </span>
            </span>
          </button>
        )
      })}
    </div>
    <h3
      className={cn(
        "text-muted-foreground mx-1 text-xs font-medium tracking-wider uppercase",
        short ? "mt-1" : "mt-2.5"
      )}
    >
      {PORTION_WORDS.freshnessHeading}
    </h3>
    <div
      role="radiogroup"
      aria-label={PORTION_WORDS.freshnessHeading}
      className="bg-muted grid grid-cols-3 gap-1.5 rounded-2xl p-1"
    >
      {FRESHNESS.map((freshness) => {
        const chosen = order.freshness === freshness
        const mark = CHOICE_MARK[freshness]
        return (
          <button
            key={freshness}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onOrder({ ...order, freshness })}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] text-sm font-medium",
              short ? "h-10" : "h-12",
              chosen ? "border-primary bg-primary/10" : "border-transparent"
            )}
          >
            {mark && (
              <FreshMark
                kind={mark}
                className={cn("size-4 shrink-0", FRESH_TONE[mark])}
              />
            )}
            {PORTION_WORDS.freshness[freshness]}
          </button>
        )
      })}
    </div>
    <span className="min-h-0 flex-1" />
    <Button
      className={cn(
        "shrink-0 rounded-2xl text-base font-semibold",
        short ? "h-12" : "h-14"
      )}
      onClick={onServe}
    >
      {PORTION_WORDS.serve}
    </Button>
  </div>
)

/** What was served for `order`, or that nothing fits it. */
export const PortionServed = ({
  order,
  dish,
  now,
  onStart,
  onAnother,
  onChange,
  short = false,
}: {
  order: Order
  dish: Dish | null
  now: Date
  onStart: (dish: Dish) => void
  onAnother: () => void
  onChange: () => void
  /** Landscape phone: compact chrome, the three choices in one row. */
  short?: boolean
}): JSX.Element => {
  const face = dish && faceOf(dish)
  return (
    <div
      data-slot="topik-portion-menu"
      data-scroll-intent="long-form"
      className={cn(
        // scroll-intent: long-form — with large text, a snack's sentences
        // and the choices under them can run past the screen.
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        short ? "gap-2" : "gap-3.5"
      )}
    >
      <h2 className="text-muted-foreground mx-1 text-xs font-medium tracking-wider uppercase">
        {PORTION_WORDS.served(order)}
      </h2>
      {dish && face ? (
        <div
          data-slot="portion-dish"
          className={cn(
            "bg-card border-border flex flex-col rounded-3xl border",
            short ? "gap-1.5 p-4" : "gap-3 p-5"
          )}
        >
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium",
              FRESH_TONE[dish.fresh.kind]
            )}
          >
            <FreshMark
              kind={dish.fresh.kind}
              className="size-[18px] shrink-0"
            />
            {PORTION_WORDS.fact(dish, now)}
          </span>
          <span
            lang="ko"
            className={cn(
              "text-[22px] leading-snug font-bold break-keep",
              short ? "line-clamp-2" : "line-clamp-4"
            )}
          >
            {face.korean}
          </span>
          {face.english && (
            <span
              className={cn(
                "text-muted-foreground text-[15px] leading-normal",
                short ? "line-clamp-1" : "line-clamp-3"
              )}
            >
              {face.english}
            </span>
          )}
          <span
            className={cn(
              "border-border border-t text-sm leading-normal",
              short ? "pt-1.5" : "pt-2.5"
            )}
          >
            {PORTION_WORDS.what(dish)}
          </span>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground mx-1 text-[15px]">
          {PORTION_WORDS.none(order)}
        </p>
      )}
      <span className="min-h-0 flex-1" />
      <div
        className={cn(
          "flex shrink-0 gap-2",
          short ? "flex-row [&>*]:min-w-0 [&>*]:flex-1" : "flex-col"
        )}
      >
        {dish && (
          <>
            <Button
              className={cn(
                "rounded-2xl text-base font-semibold",
                short ? "h-12" : "h-14"
              )}
              onClick={() => onStart(dish)}
            >
              {PORTION_WORDS.start}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-2xl text-base"
              onClick={onAnother}
            >
              {PORTION_WORDS.another}
            </Button>
          </>
        )}
        <Button
          variant={dish ? "ghost" : "default"}
          className={cn(
            "rounded-2xl text-[15px]",
            short ? "h-12" : "h-11",
            dish && "text-muted-foreground"
          )}
          onClick={onChange}
        >
          {PORTION_WORDS.change}
        </Button>
      </div>
    </div>
  )
}

type PortionMenuProps = {
  held: Holdings
  tally: Tally
  now: Date
  /** The order the question screen opens on (`openingOrder`). */
  initialOrder: Order
  /** An order was served: the host keeps it for next time. */
  onOrdered: (order: Order) => void
  onStart: (dish: Dish) => void
  /** Landscape phone: compact chrome. */
  short?: boolean
}

export const PortionMenu = ({
  held,
  tally,
  now,
  initialOrder,
  onOrdered,
  onStart,
  short = false,
}: PortionMenuProps): JSX.Element => {
  const [order, setOrder] = useState(initialOrder)
  // What was served for this order, oldest first, and the dish on screen;
  // null while the order is being asked.
  const [table, setTable] = useState<{
    dish: Dish | null
    served: ReadonlyArray<string>
  } | null>(null)

  const serveNext = (served: ReadonlyArray<string>): void => {
    const dish = serve({ order, held, tally, now, served })
    setTable({ dish, served: dish ? servedAfter(served, dish) : served })
  }

  return table === null ? (
    <PortionAsk
      order={order}
      onOrder={setOrder}
      onServe={() => {
        onOrdered(order)
        serveNext([])
      }}
      short={short}
    />
  ) : (
    <PortionServed
      order={order}
      dish={table.dish}
      now={now}
      onStart={onStart}
      onAnother={() => serveNext(table.served)}
      onChange={() => setTable(null)}
      short={short}
    />
  )
}
