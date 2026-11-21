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

/**
 * The interview week's pages, each a place (WALK5's friction, C861): its way
 * in, the questions, a question and its rungs, the reads, how a week goes,
 * and past weeks (`apps/www/src/lib/interview-week/places.ts` maps a route
 * to one).
 */
const INTERVIEW_PLACES: ReadonlyArray<Choice> = [
  { id: "way-in", name: "The week" },
  { id: "questions", name: "Questions" },
  { id: "question", name: "A question" },
  { id: "study", name: "Read the answer" },
  { id: "aloud", name: "Read it aloud" },
  { id: "say", name: "Say it" },
  { id: "reads", name: "Scripts" },
  { id: "read", name: "A script" },
  { id: "how", name: "How a week goes" },
  { id: "past", name: "Past weeks" },
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
      emits: ["taken", "left"],
      touches: true,
      places: [{ id: "record", name: "How each went" }],
    },
    // Interview: the week's mock interview and reads, said aloud (IW5), with
    // its way in: the questions and how a week goes (IW15).
    {
      id: "interview-week",
      surface: "apk",
      name: "The interview week",
      routes: [
        "/jobs/interview",
        "/jobs/interview/questions",
        "/jobs/interview/how",
        "/jobs/interview/past",
        "/jobs/interview/q/$question",
        "/jobs/interview/q/$question/study",
        "/jobs/interview/q/$question/aloud",
        "/jobs/interview/q/$question/say",
        "/jobs/interview/reads",
        "/jobs/interview/reads/$card",
      ],
      offer: null,
      emits: ["taken", "left"],
      touches: true,
      places: INTERVIEW_PLACES,
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
