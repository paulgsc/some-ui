/**
 * How each member of C1119's algebra draws, on the theme's tokens so it holds
 * in every theme. The holder's name is always written beside it, so colour
 * is never the only sign. Total by its type: a new holder or urgency fails to
 * compile here until it says how it draws.
 */ import type { Urgency } from "@/lib/cooking/algebra"
import type { Holder } from "@/lib/cooking/model"

type Look = {
  /** A holder's pill. */
  readonly pill: string
  /** The current station's mark on a train's line. */
  readonly mark: string
  /** The current stop's dot in the overview. */
  readonly dot: string
  /** The bar at the top, when this is the most urgent blocker. */
  readonly bar: string
}

export const LOOKS: Readonly<Record<Holder, Readonly<Record<Urgency, Look>>>> =
  {
    you: {
      now: {
        pill: "bg-warning text-warning-foreground border-warning",
        mark: "bg-warning border-warning",
        dot: "fill-warning stroke-warning",
        bar: "bg-warning text-warning-foreground",
      },
      today: {
        pill: "bg-warning/10 text-warning border-warning",
        mark: "bg-warning/20 border-warning",
        dot: "fill-warning/20 stroke-warning",
        bar: "bg-warning/10 text-foreground border-b-2 border-warning",
      },
      whenever: {
        pill: "text-warning border-warning border-dashed",
        mark: "bg-background border-warning border-dashed",
        dot: "fill-background stroke-warning [stroke-dasharray:1.6_1.2]",
        bar: "bg-background text-foreground border-b-2 border-dashed border-warning",
      },
    },
    claude: {
      now: {
        pill: "bg-primary text-primary-foreground border-primary",
        mark: "bg-primary border-primary",
        dot: "fill-primary stroke-primary",
        bar: "bg-primary text-primary-foreground",
      },
      today: {
        pill: "bg-primary/10 text-primary border-primary",
        mark: "bg-primary/20 border-primary",
        dot: "fill-primary/20 stroke-primary",
        bar: "bg-primary/10 text-foreground border-b-2 border-primary",
      },
      whenever: {
        pill: "text-primary border-primary border-dashed",
        mark: "bg-background border-primary border-dashed",
        dot: "fill-background stroke-primary [stroke-dasharray:1.6_1.2]",
        bar: "bg-background text-foreground border-b-2 border-dashed border-primary",
      },
    },
    checks: {
      now: {
        pill: "bg-muted-foreground text-background border-muted-foreground",
        mark: "bg-muted-foreground border-muted-foreground",
        dot: "fill-muted-foreground stroke-muted-foreground",
        bar: "bg-muted-foreground text-background",
      },
      today: {
        pill: "bg-muted text-muted-foreground border-muted-foreground",
        mark: "bg-muted border-muted-foreground",
        dot: "fill-muted stroke-muted-foreground",
        bar: "bg-muted text-foreground border-b-2 border-muted-foreground",
      },
      whenever: {
        pill: "text-muted-foreground border-muted-foreground border-dashed",
        mark: "bg-background border-muted-foreground border-dashed",
        dot: "fill-background stroke-muted-foreground [stroke-dasharray:1.6_1.2]",
        bar: "bg-background text-foreground border-b-2 border-dashed border-muted-foreground",
      },
    },
    home: {
      now: {
        pill: "bg-chart-2 text-background border-chart-2",
        mark: "bg-chart-2 border-chart-2",
        dot: "fill-chart-2 stroke-chart-2",
        bar: "bg-chart-2 text-background",
      },
      today: {
        pill: "bg-chart-2/10 text-chart-2 border-chart-2",
        mark: "bg-chart-2/20 border-chart-2",
        dot: "fill-chart-2/20 stroke-chart-2",
        bar: "bg-chart-2/10 text-foreground border-b-2 border-chart-2",
      },
      whenever: {
        pill: "text-chart-2 border-chart-2 border-dashed",
        mark: "bg-background border-chart-2 border-dashed",
        dot: "fill-background stroke-chart-2 [stroke-dasharray:1.6_1.2]",
        bar: "bg-background text-foreground border-b-2 border-dashed border-chart-2",
      },
    },
  }

/** The card's top edge over a stop where its train stands. */
export const EDGE: Readonly<Record<Holder, string>> = {
  you: "border-t-warning",
  claude: "border-t-primary",
  checks: "border-t-muted-foreground",
  home: "border-t-chart-2",
}

/** A holder's pill on a stop that isn't where its train stands. */
export const QUIET_PILL: Readonly<Record<Holder, string>> = {
  you: "text-warning border-warning/40",
  claude: "text-primary border-primary/40",
  checks: "text-muted-foreground border-border",
  home: "text-chart-2 border-chart-2/40",
}
