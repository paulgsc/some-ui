/**
 * Every word the Studio screens say (Start, Record, Done for now), and the
 * lines each sitting leaves in the project's log for the next one. One pure
 * table, in the person's terms: what is kept where, and what to do next,
 * never the machinery (`__tests__/words.test.ts` holds that).
 */
import { formatSize, listed } from "@some-ui/core-utils"
import type { Look, Voice } from "@some-ui/video-render"
import type { RecordingFailure } from "@some-ui/voice-capture"
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import { formatDuration } from "@soundbites/lib/format"
import type { QuestionId } from "@soundbites/lib/idea/model"

/** How a sitting went, as the person answers it. */
export type Went = "smooth" | "snags" | "rough"

/** A sitting the Start screen offers. Only Record is on the phone so far. */
export const SITTING_KINDS = ["record", "watch", "shape", "finish"] as const

export type SittingKind = (typeof SITTING_KINDS)[number]

/** What can go wrong while recording, offered as "What got in the way?". */
export type Snag = "mic" | "words" | "interrupted" | "screen"

/** A number of seconds, written as one: `4.7 s`. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1_000).toFixed(1)} s`
}

/** Each Look plan (ST6): its name, and what it sets. */
const LOOK_WORDS = {
  plain: {
    name: "Plain",
    sets: "Straight cuts, a still picture, no music and no sounds. The words appear as a whole line.",
  },
  calm: {
    name: "Calm",
    sets: "Soft crossfades and a slow push-in, music low under your voice, and each word lighting up as you say it.",
  },
  lively: {
    name: "Lively",
    sets: "Scenes slide up into each other, the picture punches in at each tap, a whoosh and clicks, and music rising between your lines.",
  },
} as const satisfies Record<Look, { name: string; sets: string }>

/** Each Voice plan (ST6): its name, and what it sets. */
const VOICE_WORDS = {
  "ad-lib": {
    name: "Ad-lib",
    sets: "You make each scene's point in your own words. Claude checks it stays true, and the subtitles follow what you said.",
  },
  read: {
    name: "Read",
    sets: "You read each scene's line word for word, and the subtitles show the line.",
  },
  mixed: {
    name: "Mixed",
    sets: "Each scene says whether to make its point or read its line.",
  },
} as const satisfies Record<Voice, { name: string; sets: string }>

const shapeStatus = (look: Look, voice: Voice): string =>
  `${LOOK_WORDS[look].name} look, ${VOICE_WORDS[voice].name} voice`

/** What sharing frees: the room the shared takes held. */
const MAKING_ROOM =
  "On Start, share a video's takes with Claude and say they reached Drive: they leave the phone, and the room they held is free."

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
    openNewer: "Open a primer or Claude's version",
    primerHint:
      "A primer.json in Build Journal › voice › primers, or the project.json Claude sent back.",
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

  /** Shape (ST6): a plan for the look, then one for the voice, never a lever. */
  shape: {
    lookQuestion: "How should it look?",
    voiceQuestion: "How will you talk?",
    looks: LOOK_WORDS,
    voices: VOICE_WORDS,
    now: "Now",
    next: "Next",
    keep: "Keep this",
    back: "Back",
    kept: (look: Look, voice: Voice): string =>
      `Shaped: ${LOOK_WORDS[look].name}, ${VOICE_WORDS[voice].name}. The next video drawn follows it.`,
    status: shapeStatus,
    revised: (look: Look, voice: Voice): string =>
      `Shape: ${shapeStatus(look, voice)}`,
  },

  /** Watch (ST5): a review render, notes pinned to its moments. */
  watch: {
    heading: "Watch",
    open: "Open a review render",
    openHint:
      "Pick the video and the review.json beside it, together, from Build Journal › voice › reviews.",
    pickBoth: "Pick the video and its review.json together.",
    unreadable:
      "That review.json can't be read. Pick the video and its review.json again.",
    notThisVideo:
      "That render is of a version this phone doesn't have. Open Claude's version first.",
    noteLabel: "Your note",
    noteHere: (ms: number): string => `Note here · ${formatDuration(ms)}`,
    noted: "Noted, pinned to this moment.",
    changed: (text: string): string =>
      `Claude changed this, from your note: "${text}"`,
    good: "Good",
    notYet: "Not yet",
    notYetText: (text: string): string => `Not yet: ${text}`,
    back: "Back",
    status: (changes: number): string =>
      changes === 0
        ? "Note any moment of the review render"
        : `${plural(changes, "change", "changes")} of Claude's to watch`,
  },

  /** A version back from Claude, opened as a primer is (ST8). */
  merge: {
    merged: (message: string): string => `Claude's version is in: ${message}`,
    same: "This phone already has everything in that file.",
    moved:
      "This phone made a version after that file was shared. Share the video with Claude again, and ask for the round to be redone on it.",
    notHere: "That file is for a video that isn't on this phone.",
    unreadable: "That file can't be opened as a Studio video.",
  },

  /** Finish (ST7): ready for YouTube, or the one thing missing. */
  finish: {
    heading: "Finish",
    note: (text: string): string =>
      `A note is still open: "${text}". Settle it before this goes up.`,
    goNote: "Go to its scene",
    take: (n: number): string => `Scene ${n} has no kept take yet.`,
    goTake: (n: number): string => `Record scene ${n}`,
    unmarked:
      "Every scene has its take and no note is open. Say it's ready when you have watched it through.",
    mark: "It's ready",
    ready: "Ready for YouTube.",
    uploadCopy:
      "Next, ask Claude for the upload copy: the full video, its title, its description with the music credit, and its captions file, on the shorts page. You upload it to YouTube yourself.",
    linkLabel: "Its YouTube link, once it is up",
    keepLink: "Keep this link",
    notALink:
      "That isn't a YouTube video's link. Copy it from YouTube's Share button.",
    released: "Kept as this version's release.",
    releasedLine:
      "Released. A change from here makes a new version; this one stays as it went up.",
    watchIt: "Watch it on YouTube",
    marked: "Marked ready for YouTube.",
    back: "Back",
    status: {
      note: "A note is open",
      take: (n: number): string => `Scene ${n} needs a take`,
      unmarked: "Ready to mark",
      ready: "Ready for YouTube",
      released: "Released",
    },
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
