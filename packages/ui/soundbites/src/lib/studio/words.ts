/**
 * Every word the Studio screens say (Start, Record, Done for now), and the
 * lines each sitting leaves in the project's log for the next one. One pure
 * table, in the person's terms: what is kept where, and what to do next,
 * never the machinery (`__tests__/words.test.ts` holds that).
 */
import { formatSize } from "@some-ui/core-utils"
import type { RecordingFailure } from "@some-ui/voice-capture"
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import type { QuestionId } from "@soundbites/lib/idea/model"

/** How a sitting went, as the person answers it. */
export type Went = "smooth" | "snags" | "rough"

/** A sitting the Start screen offers. Only Record is on the phone so far. */
export type SittingKind = "record" | "watch" | "shape" | "finish"

/** What can go wrong while recording, offered as "What got in the way?". */
export type Snag = "mic" | "words" | "interrupted" | "screen"

/** A number of seconds, written as one: `4.7 s`. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1_000).toFixed(1)} s`
}

/** What sharing frees: the room the shared takes held. */
const MAKING_ROOM =
  "On Start, share a video's takes with Claude and say they reached Drive: they leave the phone, and the room they held is free."

/** `2`, `2 and 3`, `2, 3 and 5`. */
function listed(items: ReadonlyArray<string>): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export const STUDIO_WORDS = {
  heading: "Studio",
  reading: "Opening your video…",
  unreadable: "Couldn't open the video kept on this phone.",
  readAgain: "Try again",

  start: {
    eyebrow: "Your video",
    empty: "No video yet",
    emptyLine:
      "Open a primer Claude saved to Drive, and its scenes are ready to record.",
    openPrimer: "Open a primer",
    openNewer: "Open a newer primer",
    primerHint: "A primer.json in Build Journal › voice › primers.",
    startHere: "Start here",
    others: "Other videos with takes on the phone",
    onPhone: (n: number): string =>
      `${plural(n, "take", "takes")} on the phone`,
    open: "Open",
    shareLine:
      "This video's takes are on the phone. Share them with Claude, and once they're in Drive they leave the phone.",
    sittings: {
      record: "Record",
      watch: "Watch",
      shape: "Shape",
      finish: "Finish",
    } satisfies Record<SittingKind, string>,
    notYet: "Not on the phone yet",
    which: (title: string): string =>
      `Is this the next version of “${title}”, or a new video?`,
    nextVersion: (title: string): string => `Next version of “${title}”`,
    newVideo: "A new video",
    cancel: "Keep things as they are",
    opened: (title: string): string => `Opened “${title}”.`,
    revised: (title: string): string =>
      `“${title}” has a new version. Every take is still kept.`,
  },

  record: {
    sceneOf: (n: number, of: number): string => `Scene ${n} of ${of}`,
    onScreen: (artifact: string): string => `On screen: ${artifact}`,
    adLib: "Say it your way",
    read: "Read it word for word",
    claudeNote: "Claude's note",
    mustStayTrue: (n: number): string => `Must stay true · ${n}`,
    talk: "Start talking",
    opening: "Opening the microphone",
    stop: "Done, keep it",
    keeping: "Keeping it",
    again: "Again",
    keepNext: "Keep · next scene",
    keepLast: "Keep · that's every scene",
    previous: "Previous scene",
    play: "Play it back",
    stopPlaying: "Stop",
    throwAway: "Throw it away",
    doneForNow: "Done for now",
    runs: (ms: number): string => `This scene runs ${seconds(ms)}`,
    runsWith: (ms: number): string =>
      `This scene runs ${seconds(ms)}: your take and a breath`,
    upTo: (ms: number): string => `Up to ${seconds(ms)} for this take.`,
    elapsed: (ms: number, capMs: number): string =>
      `${seconds(ms)} · up to ${seconds(capMs)}`,
    blocked: (reason: RecordingFailure): string =>
      RECORDING_FAILURE_COPY[reason],
  },

  notice: {
    kept: (ms: number): string => `Kept ${seconds(ms)}.`,
    tooShort: "Too short to keep. Tap, talk, then tap again.",
    notKept: "That take couldn't be kept. Try again?",
    full: `No room on the phone for that take, so it wasn't kept. ${MAKING_ROOM}`,
    noRoom: `No room on the phone for another take. ${MAKING_ROOM}`,
    spent:
      "The primer's time is all used. Record a long scene again, shorter, to make room.",
    thrownAway: "Thrown away. Nothing kept.",
    notStarted:
      "The screen went away before the microphone opened. Tap to talk.",
    notSaved: "That change couldn't be saved, so nothing changed. Try again?",
    unreadableFile: "That file couldn't be read.",
    audioMissing: "That take's audio isn't on the phone any more.",
    notPlayable: "That take couldn't be played.",
    behind:
      "The phone's videos couldn't be read just now, so this screen may be behind. What you record is still kept.",
    carryFailed:
      "Your Journal episode couldn't be moved into Studio yet. It's still on the phone, and moves next time.",
    carried: (title: string, cleared: number, gone: number): string =>
      [
        cleared === 0 && gone === 0
          ? `Your Journal episode “${title}” is in Studio now, every take with it.`
          : `Your Journal episode “${title}” is in Studio now.`,
        cleared === 0
          ? ""
          : `${plural(cleared, "piece", "pieces")} of it Studio couldn't use ${cleared === 1 ? "was" : "were"} let go.`,
        gone === 0
          ? ""
          : `${plural(gone, "take's recording", "takes' recordings")} had already left the phone before it moved.`,
      ]
        .filter((line) => line !== "")
        .join(" "),
    carryStays: (bytes: number): string =>
      `Your Journal episode on this phone couldn't be moved into Studio. It stays on the phone as it was${bytes === 0 ? "." : `, and takes ${formatSize(bytes)} of the room for takes.`}`,
    carryUnread:
      "Your Journal episode on this phone couldn't be read, so it was let go.",
    cleared: (n: number): string =>
      `${plural(n, "piece", "pieces")} of the old Journal tab that Studio couldn't use ${n === 1 ? "was" : "were"} let go.`,
    arrived: (n: number): string =>
      `${plural(n, "take", "takes")} left the phone. Drive keeps ${n === 1 ? "it" : "them"}.`,
  },

  done: {
    how: "How did that go?",
    went: {
      smooth: "Smooth",
      snags: "Some snags",
      rough: "Rough",
    } satisfies Record<Went, string>,
    what: "What got in the way?",
    snags: {
      mic: "The microphone",
      words: "Finding the words",
      interrupted: "I was interrupted",
      screen: "The screen",
    } satisfies Record<Snag, string>,
    sayIt: "Or say it",
    tell: "That's it",
    saving: "Saving where you left it…",
    saved: "Saved where you left it",
    opensOn: (n: number, artifact: string): string =>
      `Next time opens on scene ${n}: ${artifact}.`,
    notSaved:
      "Where you left off couldn't be saved; next time opens on your last kept take.",
    answerNotKept: "That answer couldn't be kept.",
    share: "Share with Claude",
    sharing: "Preparing…",
    notYet: "Not yet",
    shareLine:
      "The project file and your takes, for Claude, to Drive. Once they're there, the takes can leave the phone.",
  },

  share: {
    title: "Studio takes",
    arrivedTitle: "Did they reach Drive?",
    arrivedLine:
      "Once they're in Drive, the takes that went out can leave the phone.",
    arrivedYes: "They're in Drive: let them go",
    arrivedNo: "Keep them here",
  },

  /** Catching an idea, one question at a time (ST18). */
  idea: {
    newIdea: "New idea",
    newIdeaLine: "Say what the video is, the moment it comes.",
    heading: "New idea",
    reading: "Opening your ideas…",
    unreadable:
      "The ideas kept on this phone couldn't be read, so nothing new can be kept yet.",
    questionOf: (n: number, of: number): string => `Question ${n} of ${of}`,
    questions: {
      what: {
        ask: "What's the video?",
        hint: "Say it the way you'd tell a friend.",
      },
      takeaway: {
        ask: "What should someone come away with?",
        hint: "The one thing they keep.",
      },
      spark: {
        ask: "What set it off?",
        hint: "The moment, the thing you saw, why now.",
      },
      picture: {
        ask: "What do you see on screen?",
        hint: "One picture: the scene you see first.",
      },
    } satisfies Record<QuestionId, { ask: string; hint: string }>,
    talk: "Say it",
    listening: "Listening…",
    stop: "Done talking",
    right: "That's right",
    fix: "Fix the words",
    again: "Say it again",
    type: "Type instead",
    typeHint: "Type it the way you'd say it.",
    keepWords: "Keep these words",
    skip: "Skip for now",
    noVoice:
      "Talking isn't available on this phone right now, so type it. Speech needs the microphone and the phone's offline English.",
    notHeard: "Didn't hear anything. Try again, or type it.",
    listenFailed: "Couldn't hear that. Try again, or type it.",
    notKept: "Couldn't keep that on this phone. Your words are still here.",
    kept: "Kept. Come back to it any time.",
    keptLine: (n: number): string =>
      `${plural(n, "answer", "answers")} kept as text on this phone. No sound was kept.`,
    answerSkipped: (n: number): string =>
      `Answer the ${n === 1 ? "one" : n} you skipped`,
    answerSkippedEarlier: (n: number): string =>
      `Answer the ${n === 1 ? "one" : n} you skipped last time`,
    another: "Another idea",
    back: "Back to Studio",
  },

  /** Where things stand, from the last sitting's log. */
  standing: (
    last: { readonly done: string; readonly next: string } | null
  ): string =>
    last === null
      ? "Nothing recorded yet."
      : `Last time: ${last.done} Next: ${last.next}`,

  /** Record's status line on the Start screen. */
  recordStatus: (taken: number, scenes: number): string =>
    taken === scenes
      ? `Every scene has a take (${scenes}).`
      : `${taken} of ${plural(scenes, "scene", "scenes")} have a take.`,

  /** The log's "what was done" line for a sitting. */
  sittingDone: (scenes: ReadonlyArray<number>): string =>
    scenes.length === 0
      ? "No takes this sitting."
      : `Kept takes for ${scenes.length === 1 ? "scene" : "scenes"} ${listed(scenes.map(String))}.`,

  /** The log's "what is next" line. */
  sittingNext: (
    next: { readonly n: number; readonly artifact: string } | null
  ): string =>
    next === null
      ? "Every scene has a take."
      : `Scene ${next.n}: ${next.artifact}.`,
} as const
