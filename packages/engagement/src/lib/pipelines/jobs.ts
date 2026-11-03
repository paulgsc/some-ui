/** Jobs: the phone's picks and finds, and the desktop's morning run. */
import type { Choice, Pipeline } from "@engagement/lib/registry"

/** A pick's steps (`lib/jobs/words`' `steps`). */
const PICK_STEPS: ReadonlyArray<Choice> = [
  { id: "read", name: "Read" },
  { id: "decide", name: "Decide" },
  { id: "resume", name: "Résumé" },
  { id: "apply", name: "Apply" },
  { id: "ending", name: "Ending" },
]

const jobs: Pipeline = {
  id: "jobs",
  name: "Jobs",
  wing: "jobs",
  domain: "jobs",
  affordances: [
    // Today: the one pick it opens on.
    {
      id: "todays-pick",
      surface: "apk",
      name: "Today's pick",
      routes: ["/jobs", "/jobs/pick/$day/$pickId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: PICK_STEPS,
    },
    // Every other pick of the digest, and earlier days' still open, behind a tap.
    {
      id: "other-pick",
      surface: "apk",
      name: "Another pick",
      routes: ["/jobs", "/jobs/pick/$day/$pickId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: PICK_STEPS,
    },
    // Scout: a posting I found myself, for the run's second opinion.
    {
      id: "scout",
      surface: "apk",
      name: "A posting you found",
      routes: ["/jobs/scout"],
      offer: null,
      emits: ["taken"],
      touches: true,
    },
    // Record: every pick taken, and what came of it.
    {
      id: "record",
      surface: "apk",
      name: "How each went",
      routes: ["/jobs/record"],
      offer: null,
      emits: ["taken"],
      touches: true,
    },
    // The desktop: one morning's run, what it picked and why.
    {
      id: "morning-run",
      surface: "web",
      name: "The morning run",
      routes: ["/job-run"],
      offer: null,
      emits: ["taken"],
      touches: true,
    },
  ],
}

export const JOBS: ReadonlyArray<Pipeline> = [jobs]
