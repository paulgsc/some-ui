/** Self: aph on the phone (`packages/ui/aph`). */
import type { Pipeline } from "@engagement/lib/registry"

const aph: Pipeline = {
  id: "aph",
  name: "aph",
  wing: "self",
  domain: "aph",
  affordances: [
    // Log: my figure for today, the screen aph opens on.
    {
      id: "log-mine",
      surface: "apk",
      name: "Log your figure",
      routes: ["/aph"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // History's "not logged": a day I missed.
    {
      id: "missed-day",
      surface: "apk",
      name: "A day you missed",
      routes: ["/aph/history", "/aph"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // History's "Enter their figure", to reconcile an entry.
    {
      id: "their-figure",
      surface: "apk",
      name: "Enter their figure",
      routes: ["/aph/history", "/aph"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // History: the entries and their reconciliation.
    {
      id: "history",
      surface: "apk",
      name: "History",
      routes: ["/aph/history"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Trend.
    {
      id: "trend",
      surface: "apk",
      name: "Trend",
      routes: ["/aph/trend"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

export const SELF: ReadonlyArray<Pipeline> = [aph]
