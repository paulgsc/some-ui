/**
 * Who owns each step of making a video (STUDIO ST10, #2258): what kind of
 * work it is, who does it now, who should, by which milestone, and why. The
 * epic's table (#2248, "Who owns what") is this file; change a row here to
 * move a step.
 *
 * A step reads and writes only cut-list fields and files, so moving it to
 * another owner changes its row and nothing else. `__tests__/steps.test.ts`
 * holds the rules: home runs no language model, a session keeps work that
 * isn't Claude's exactly while something named blocks the move, only the
 * owner's own steps are the owner's, and every field named is the cut list's.
 */

/** What does the work: code, the small speech model home runs, Claude, or the owner. */
export type StepKind = "code" | "small-model" | "claude" | "owner"

/** Where it runs. */
export type Owner = "phone" | "home" | "session" | "owner"

/** A cut-list field (`shots.take` is a scene's) or a file the step reads or writes. */
export type Io = { readonly field: string } | { readonly file: string }

export type Step = {
  readonly id: string
  readonly what: string
  readonly kind: StepKind
  readonly now: Owner
  readonly target: Owner
  readonly milestone: "M0" | "M1" | "M2" | null
  readonly why: string
  readonly blockedBy?: string
  readonly reads: ReadonlyArray<Io>
  readonly writes: ReadonlyArray<Io>
}

export const STEPS: ReadonlyArray<Step> = [
  {
    id: "keep-project",
    what: "Keep the project: revisions, notes, where we left off",
    kind: "code",
    now: "session",
    target: "phone",
    milestone: "M0",
    why: "Every sitting resumes from the project file alone, and the phone is where the owner works.",
    blockedBy: "ST3 (#2251): the project on the phone",
    reads: [{ field: "revisions" }, { field: "notes" }],
    writes: [{ field: "revisions" }, { field: "notes" }],
  },
  {
    id: "write-primer",
    what: "Write the primer: scenes, points, facts to keep, each idea's origin",
    kind: "claude",
    now: "session",
    target: "session",
    milestone: null,
    why: "Judgement about what the video says.",
    reads: [{ field: "notes" }],
    writes: [{ file: "primer.json" }],
  },
  {
    id: "record-footage",
    what: "Record the footage: a scripted walk of the phone build",
    kind: "code",
    now: "session",
    target: "home",
    milestone: "M2",
    why: "A script and a browser, the same every run.",
    blockedBy: "ST13 (#2261) on GWB10's worker (#2084)",
    reads: [{ file: "primer.json" }],
    writes: [{ field: "shots.picture" }],
  },
  {
    id: "fit-scenes",
    what: "Fit each scene to its take; apply the plans picked",
    kind: "code",
    now: "session",
    target: "phone",
    milestone: "M0",
    why: "Arithmetic on numbers the phone already has (take + breath).",
    blockedBy: "ST4 (#2252) and ST6 (#2254): Record and Shape on the phone",
    reads: [{ field: "shots.take" }, { field: "look" }, { field: "voice" }],
    writes: [{ field: "shots.durationMs" }, { field: "shots.voiceInMs" }],
  },
  {
    id: "carry-takes",
    what: "Carry the takes",
    kind: "code",
    now: "phone",
    target: "home",
    milestone: "M1",
    why: "Home keeps every take for good; Drive only carries them to a session.",
    reads: [{ file: "takes/" }],
    writes: [{ file: "takes/" }],
  },
  {
    id: "transcribe",
    what: "Transcribe takes and spoken notes, with word timings",
    kind: "small-model",
    now: "session",
    target: "home",
    milestone: "M1",
    why: "Home's whisper.cpp already hears every voice note; a session reinstalls a model each run.",
    blockedBy: "ST12 (#2260): the phone sending takes home",
    reads: [{ file: "takes/" }],
    writes: [{ file: "transcripts/" }],
  },
  {
    id: "check-takes",
    what: "Mechanical take checks: length, silence, the numbers said",
    kind: "code",
    now: "session",
    target: "home",
    milestone: "M1",
    why: "Rules over a transcript and a waveform.",
    blockedBy: "ST12 (#2260): the phone sending takes home",
    reads: [{ file: "takes/" }, { file: "transcripts/" }],
    writes: [{ file: "take-checks.json" }],
  },
  {
    id: "judge-takes",
    what: "Is it true? Does it sound like you?",
    kind: "claude",
    now: "session",
    target: "session",
    milestone: null,
    why: "Judgement against the facts to keep and the owner's voice.",
    reads: [{ file: "transcripts/" }, { file: "primer.json" }],
    writes: [{ field: "notes" }],
  },
  {
    id: "act-on-notes",
    what: "Act on free-text notes",
    kind: "claude",
    now: "session",
    target: "session",
    milestone: null,
    why: "A note in the owner's words needs reading, not matching.",
    reads: [{ field: "notes" }],
    writes: [{ field: "revisions" }, { field: "shots.overrides" }],
  },
  {
    id: "render",
    what: "Draw the burn-ins; render, mix, level",
    kind: "code",
    now: "session",
    target: "home",
    milestone: "M2",
    why: "`@some-ui/video-render`: a cut list in, the same bytes out.",
    blockedBy: "ST13 (#2261) on GWB10's worker (#2084)",
    reads: [
      { field: "series" },
      { field: "look" },
      { field: "voice" },
      { field: "music" },
      { field: "shots" },
      { field: "burnIns" },
      { file: "series.json" },
    ],
    writes: [{ file: "video.mp4" }, { file: "shot-times.json" }],
  },
  {
    id: "read-mark",
    what: "Read the authorship mark blind, per design",
    kind: "claude",
    now: "session",
    target: "session",
    milestone: null,
    why: "An observer with no part in the video (ST17).",
    reads: [{ file: "video.mp4" }],
    writes: [{ file: "readings.json" }],
  },
  {
    id: "deliver",
    what: "Deliver the MP4 to the phone",
    kind: "code",
    now: "session",
    target: "home",
    milestone: "M2",
    why: "Home serves it over the LAN; today a session publishes the shorts page.",
    blockedBy: "ST13 (#2261): home renders",
    reads: [{ file: "video.mp4" }],
    writes: [],
  },
  {
    id: "upload",
    what: "Upload, edit or remove on YouTube",
    kind: "owner",
    now: "owner",
    target: "owner",
    milestone: null,
    why: "Uploading stays the owner's, by hand and on purpose (#2248, Decided 6).",
    reads: [{ file: "video.mp4" }],
    writes: [],
  },
]
