/**
 * Every word the Studio screens say (Start, Record, Done for now), and the
 * lines each sitting leaves in the project's log for the next one. One pure
 * table, in the person's terms: what is kept where, and what to do next,
 * never the machinery (`__tests__/words.test.ts` holds that).
 */
import { formatSize, formatTimecode, listed } from "@some-ui/core-utils"
import type { Idea, Look, Voice } from "@some-ui/video-render"
import type { RecordingFailure } from "@some-ui/voice-capture"
import {
  RECORDING_FAILURE_COPY,
  TAKE_ENDING_WORDS,
  TAKE_WORDS,
} from "@some-ui/voice-capture"
import type {
  IdeaFormat,
  IdeaStage,
  QuestionId,
} from "@soundbites/lib/idea/model"
import type { ShelfNotice } from "@soundbites/lib/idea/shelf"
import type { LetGo, LetGoChoice } from "@soundbites/lib/project/let-go"

/**
 * Whose idea a scene presents (ST16), as the person reads it: theirs, with
 * where their words are; Claude's; or a source's, by its title.
 */
export type Whose =
  /** A note's own words, or null when the project doesn't hold that note. */
  | {
      readonly who: "you"
      readonly from: "note"
      readonly words: string | null
    }
  | { readonly who: "you"; readonly from: Exclude<OwnWordsKind, "note"> }
  | { readonly who: "agent" }
  | { readonly who: "source"; readonly title: string }

/** Where an idea of the owner's cites their words (`OwnerRefSchema.kind`). */
type OwnWordsKind = Extract<Idea, { origin: "you" }>["from"]["kind"]

/** Where the owner's words are, for each citation but a note's own words. */
const YOUR_WORDS: Readonly<Record<OwnWordsKind, string>> = {
  note: "Your idea, from a note of yours",
  take: "Your idea, from what you said in a take",
  "voice-note": "Your idea, from one of your voice notes",
  prompt: "Your idea, from what you asked Claude",
  idea: "Your idea, from your answers when you caught it",
}

function whose(idea: Whose): string {
  if (idea.who === "agent") return "Claude's idea"
  if (idea.who === "source") return `From “${idea.title}”`
  return idea.from === "note" && idea.words !== null
    ? `Your idea, in your words: “${idea.words}”`
    : YOUR_WORDS[idea.from]
}

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

/** Each choice of when a take home holds leaves the phone, as Studio offers it. */
const LET_GO_CHOICE_WORDS = {
  home: "Let takes go once home has them",
  drive: "Keep each until Drive has it too",
} as const satisfies Record<LetGo, string>

/** What Start's "Drive has it" is called, wherever another screen names it. */
const DRIVE_HAS_IT = "Drive has it"

/** What each choice does, as Start says it under the choice. */
const LET_GO_SAYS = {
  home: "Takes leave the phone once home has them.",
  drive: `Each take stays on the phone until Drive has it too. It goes when you tap “${DRIVE_HAS_IT}”, or once Claude finds it in Drive and this phone next hears so from home.`,
} as const satisfies Record<LetGo, string>

/**
 * What frees room on the phone for takes (HF11, #2401): the takes home
 * holds, once the owner's choice lets them go, and what to do where they
 * wait on it (`waiting` of them).
 */
function makingRoom(letGo: LetGoChoice, waiting: number): string {
  const takes = plural(waiting, "take", "takes")
  if (waiting > 0 && letGo === null)
    return `Home has ${takes} still on the phone, waiting on your choice. On Start, choose when takes leave the phone: “${LET_GO_CHOICE_WORDS.home}” or “${LET_GO_CHOICE_WORDS.drive}”.`
  if (waiting > 0 && letGo === "drive")
    return `Home has ${takes} still on the phone, kept until Drive has ${waiting === 1 ? "it" : "them"} too. On Start, tap “${DRIVE_HAS_IT}” on each one Drive holds.`
  if (letGo === null)
    return "Takes leave the phone once home holds them and you choose when. Start offers that choice once home holds a take."
  if (letGo === "drive")
    return `Takes leave the phone once home holds them and Drive has them too, when you tap “${DRIVE_HAS_IT}” or this phone hears so from home, and the room they held is free.`
  return "Takes leave the phone once home holds them, and the room they held is free."
}

/** How a take is named in the list of those home holds. */
function takeLine(scene: number | null, ms: number): string {
  return `${scene === null ? "A scene since dropped" : `Scene ${scene}`} · ${seconds(ms)}`
}

/** `under a minute`, `1 min`, `1 h 05 min`. */
function minutes(ms: number): string {
  const total = Math.floor(ms / 60_000)
  if (total < 1) return "under a minute"
  const hours = Math.floor(total / 60)
  return hours === 0
    ? `${total} min`
    : `${hours} h ${String(total % 60).padStart(2, "0")} min`
}

/** Where Claude's version met a change made on this phone, and the phone's stayed. */
type KeptHere = {
  readonly scenes: ReadonlyArray<number>
  readonly plans: boolean
}

const NOTHING_KEPT: KeptHere = { scenes: [], plans: false }

function keptLines(kept: KeptHere): Array<string> {
  const lines: Array<string> = []
  const n = kept.scenes.length
  if (n > 0)
    lines.push(
      `${n === 1 ? "Scene" : "Scenes"} ${andList(kept.scenes.map(String))} kept what you did here, so Claude's ${n === 1 ? "change to it" : "changes to them"} didn't come in.`
    )
  if (kept.plans)
    lines.push(
      "The look and voice you chose here stayed, so Claude's change to them didn't come in."
    )
  return lines
}

/** "1", "1 and 2", "1, 2 and 3". */
function andList(items: ReadonlyArray<string>): string {
  const last = items.at(-1) ?? ""
  return items.length < 2
    ? last
    : `${items.slice(0, -1).join(", ")} and ${last}`
}

/** Scenes whose idea waits on the owner's word, as Watch's row and Finish say it. */
function ideasToConfirm(n: number): string {
  return `Whose idea: ${plural(n, "scene", "scenes")} to confirm`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export const STUDIO_WORDS = {
  heading: "Studio",
  reading: "Opening your video…",
  unreadable: "Couldn't open the video kept on this phone.",
  readAgain: "Try again",

  /**
   * Start says the loop in the person's terms. Every word in this table
   * names what you do or what Claude made, never a file, folder or format
   * (SW1, #2325): `__tests__/words.test.ts` refuses those anywhere in it.
   */
  start: {
    eyebrow: "Your video",
    empty: "No video yet",
    emptyLine:
      "A video starts as an idea you say out loud. Here is the way through.",
    /** The loop, as steps; the third is the sittings below. */
    steps: {
      idea: {
        title: "Catch the idea",
        line: "Say what the video is, the moment it comes. Here, by voice.",
      },
      scenes: {
        title: "Claude turns it into scenes",
        line: "From Your ideas, share the idea with Claude. Claude's scenes come back to it, and the video starts from them.",
      },
      sittings: {
        title: "Record, Watch, Shape, Finish",
        line: "One sitting at a time, on this phone, until it's ready to upload.",
      },
    },
    stepOf: (n: number): string => `Step ${n}`,
    openSent: "Open what Claude sent",
    openSentHint:
      "The scenes Claude made for your idea, or Claude's version of your video.",
    openNewer: "Open Claude's version",
    openNewerHint:
      "Claude's version of this video, or the scenes for a new one.",
    sentProblem:
      "That isn't something Claude made for Studio, or part of it is missing. Ask Claude for it again.",
    /** Claude's reply about an idea, picked here instead of on the idea (ST19). */
    ideaReply:
      "That's Claude's reply about one of your ideas. Open it from the idea, in Your ideas.",
    startHere: "Start here",
    others: "Other videos with takes on the phone",
    onPhone: (n: number): string =>
      `${plural(n, "take", "takes")} on the phone`,
    open: "Open",
    shareLine:
      "This video's takes are on the phone. Share them with Claude so a session can hear them; they stay here until home holds them, then leave as you choose.",
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
    keepNext: "Keep · next scene",
    keepLast: "Keep · that's every scene",
    previous: "Previous scene",
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
    // eslint-disable-next-line one-owner/no-local-take-words -- Studio says its own endings until its machine embeds the take kit (#2442)
    tooShort: "Too short to keep. Tap, talk, then tap again.",
    notKept: "That take couldn't be kept. Try again?",
    full: (letGo: LetGoChoice, waiting: number): string =>
      `No room on the phone for that take, so it wasn't kept. ${makingRoom(letGo, waiting)}`,
    noRoom: (letGo: LetGoChoice, waiting: number): string =>
      `No room on the phone for another take. ${makingRoom(letGo, waiting)}`,
    spent:
      "The video's time is all used. Record a long scene again, shorter, to make room.",
    thrownAway: "Thrown away. Nothing kept.",
    notStarted:
      "The screen went away before the microphone opened. Tap to talk.",
    // The take pattern's own words for a take stopped while it opened.
    early: TAKE_ENDING_WORDS.early,
    notSaved: "That change couldn't be saved, so nothing changed. Try again?",
    unreadableFile:
      "That couldn't be opened. Pick it again, or ask Claude for it again.",
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
      `${plural(n, "take", "takes")} in Drive too. ${n === 1 ? "It stays" : "They stay"} on the phone until home holds ${n === 1 ? "it" : "them"}, then ${n === 1 ? "leaves" : "leave"} as you choose.`,
  },

  /**
   * When a take home holds leaves the phone (HF11, #2401): the owner's one
   * choice, on Start once home holds a take, and each take waiting on it.
   */
  letGo: {
    heading: "When takes leave the phone",
    ask: (n: number): string =>
      `Home has ${plural(n, "take", "takes")} from this phone. Nothing leaves the phone until you choose when.`,
    choices: LET_GO_CHOICE_WORDS,
    says: LET_GO_SAYS,
    change: "You can change this at any time.",
    chosen: {
      home: LET_GO_SAYS.home,
      drive:
        "Each take home has stays on the phone until you say Drive has it too, or Claude finds it in Drive and this phone next hears so from home.",
    } satisfies Record<LetGo, string>,
    notKept:
      "That choice couldn't be kept on the phone, so nothing changed. Try again?",
    waiting: (n: number): string =>
      `${plural(n, "take", "takes")} home has, still on the phone`,
    take: takeLine,
    shared: "You shared this one to Drive.",
    driveHasIt: DRIVE_HAS_IT,
    driveHasItFor: (scene: number | null, ms: number): string =>
      `${DRIVE_HAS_IT}: ${takeLine(scene, ms)}`,
    left: (n: number): string =>
      `${plural(n, "take", "takes")} left the phone. Home has ${n === 1 ? "it" : "them"}.`,
    driveLeft: "That take left the phone. Home and Drive both have it.",
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
      "Your video and your takes, for Claude, to Drive. They stay on this phone until home holds them, then leave as you choose.",
  },

  share: {
    title: "Studio takes",
    arrivedTitle: "Did they reach Drive?",
    arrivedLine:
      "Once they're in Drive, Claude can hear them. The takes stay on this phone until home holds them, then leave as you choose.",
    arrivedYes: "They're in Drive",
    arrivedNo: "Not yet",
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

  /** Start's quiet links (ST4). */
  quiet: { history: "History", time: "Time spent" },

  history: {
    heading: "Every version",
    by: { owner: "You", claude: "Claude" },
    line: (rev: number, who: string): string => `Version ${rev} · ${who}`,
    back: "Back",
  },

  time: {
    heading: "Time spent",
    none: "No time logged on this video yet. It is counted while a sitting is open and the screen is showing.",
    total: (ms: number): string => `In all: ${minutes(ms)}`,
    spent: minutes,
    screens: {
      named: {
        start: "Start",
        done: "Done for now",
        shape: "Shape",
        finish: "Finish",
        watch: "Watch",
        history: "History",
        time: "Time spent",
      },
      scene: (n: number): string => `Scene ${n}`,
      droppedScene: "A scene since dropped",
      other: "Elsewhere in Studio",
    },
    back: "Back",
  },

  /** Watch (ST5): a review render, notes pinned to its moments. */
  watch: {
    heading: "Watch",
    open: "Open a review render",
    openHint:
      "Pick the review video Claude sent and the notes beside it, together, from your Drive.",
    pickBoth: "Pick the video and the notes beside it together.",
    unreadable:
      "Those notes can't be read. Pick the video and the notes beside it again.",
    notThisVideo:
      "That render is of a version this phone doesn't have. Open Claude's version first.",
    noteLabel: "Your note",
    noteHere: (ms: number): string => `Note here · ${formatTimecode(ms)}`,
    noted: "Noted, pinned to this moment.",
    /** Saying a note instead of typing it (ST5), pinned where it was begun. */
    say: (ms: number): string => `Say a note · ${formatTimecode(ms)}`,
    gettingReady: "Getting ready…",
    listening: "Listening…",
    stop: "Done talking",
    finishing: "Finishing…",
    keepSaid: (ms: number): string => `Note this at ${formatTimecode(ms)}`,
    again: "Say it again",
    drop: "Let it go",
    heardNothing: "Didn't hear anything. Say it again, or type it.",
    notHeard: "Couldn't hear that. Say it again, or type it.",
    typeInstead:
      "Talking isn't available on this phone right now, so type the note.",
    notStarted: "Listening isn't working right now. Type the note instead.",
    changed: (text: string): string =>
      `Claude changed this, from your note: "${text}"`,
    good: "Good",
    notYet: "Not yet",
    notYetText: (text: string): string => `Not yet: ${text}`,
    back: "Back",
    status: (changes: number, ideas: number): string =>
      changes === 0 && ideas === 0
        ? "Note any moment of the review render"
        : [
            ...(changes === 0
              ? []
              : [
                  `${plural(changes, "change", "changes")} of Claude's to watch`,
                ]),
            ...(ideas === 0 ? [] : [ideasToConfirm(ideas)]),
          ].join(" · "),
  },

  /**
   * Whose idea each scene is (ST5, ST16): asked in Watch as the scene
   * plays, one scene at a time; yours always says where your words are.
   */
  origin: {
    whose,
    question: (n: number): string => `Whose idea is scene ${n}?`,
    proposed: (idea: Whose): string => `As it stands: ${whose(idea)}.`,
    right: "That's right",
    notQuite: "Not quite",
    said: (n: number, idea: Whose): string =>
      `Scene ${n}: ${whose(idea)}. You said so.`,
    who: "Whose idea is it?",
    mine: "Mine",
    mineElse: "Mine, from other words",
    claudes: "Claude's",
    where: "Where is it, in your own words?",
    whereHint:
      "The video credits you with the idea only where your own words show it.",
    inTake: "In my take for this scene",
    wordsLabel: "Where it came from",
    keepWords: "Keep it as mine",
    say: "Say where it came from",
    back: "Leave it as it stands",
    kept: "Kept: whose idea it is.",
    /** Answered of an idea the scene no longer has: nothing kept, asked again. */
    moved: (n: number): string =>
      `Scene ${n} changed in the meantime. Whose idea is it now?`,
    /** The new version a correction makes, as History lists it. */
    revised: (n: number, idea: Whose): string =>
      `Scene ${n}'s idea: ${whose(idea)}`,
  },

  /** A version back from Claude, opened as a primer is (ST8). */
  merge: {
    /**
     * Claude's version is in. Where Claude and this phone both changed the
     * same thing after sharing, the phone's stayed (#2317): the scenes, by
     * their place in the video, and whether it was the plans.
     */
    merged: (message: string, kept: KeptHere = NOTHING_KEPT): string =>
      [`Claude's version is in: ${message}`, ...keptLines(kept)].join(" "),
    /** Everything in Claude's version, this phone had changed too. */
    kept: (kept: KeptHere): string =>
      ["Nothing in Claude's version came in.", ...keptLines(kept)].join(" "),
    same: "This phone already has everything in Claude's version.",
    moved:
      "Since the video was shared, this phone and Claude changed it in ways that can't both stand. Share the video with Claude again, and ask for the round to be redone on it.",
    notHere: "That is Claude's version of a video that isn't on this phone.",
    unreadable:
      "That isn't Claude's version of a Studio video. Ask Claude for it again.",
  },

  /** Finish (ST7): ready for YouTube, or the one thing missing. */
  finish: {
    heading: "Finish",
    note: (text: string): string =>
      `A note is still open: "${text}". Settle it before this goes up.`,
    goNote: "Go to its scene",
    take: (n: number): string => `Scene ${n} has no kept take yet.`,
    goTake: (n: number): string => `Record scene ${n}`,
    idea: ideasToConfirm,
    goIdea: (n: number): string => `Watch from scene ${n}`,
    unmarked:
      "Every scene has its take and its idea said, and no note is open. Say it's ready when you have watched it through.",
    mark: "It's ready",
    ready: "Ready for YouTube.",
    uploadCopy:
      "Next, ask Claude for the upload copy: the full video, its title, its description with the music credit, and its captions, on the shorts page. You upload it to YouTube yourself.",
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
      idea: ideasToConfirm,
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
    gettingReady: "Getting ready…",
    listening: "Listening…",
    stop: "Done talking",
    finishing: "Finishing…",
    /** The take is kept, and home is hearing it (IH1). */
    hearing: "Home is hearing it…",
    hearingLine:
      "What you said is kept. Your words come back from home in a minute or two.",
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
    listenNotStarted: "Listening isn't working right now. Type it instead.",
    notKept: "Couldn't keep that on this phone. Your words are still here.",
    keptOnHome:
      "Home has what you said but hasn't heard it yet. Type the words for now.",
    keptOnPhone:
      "What you said is kept on this phone and goes home later. Type the words for now.",
    homeNoWords:
      "Home has what you said but can't give the words back yet. Type the words for now.",
    awayOnHome:
      "Home can't be reached right now. It has what you said. Type the words for now.",
    awayOnPhone:
      "Home can't be reached right now. What you said is kept on this phone and goes home later. Type the words for now.",
    takeFull:
      "There's no room on this phone for another take until home has the ones before it. Type it instead.",
    takeNotKept: "Couldn't keep that take. Try again, or type it.",
    refused: (reason: RecordingFailure): string =>
      RECORDING_FAILURE_COPY[reason],
    kept: "Kept. Come back to it any time.",
    keptLine: (n: number, took: boolean): string =>
      took
        ? `${plural(n, "answer", "answers")} kept as text on this phone. What you said is kept too, on home once it has it.`
        : `${plural(n, "answer", "answers")} kept as text on this phone. No sound was kept.`,
    answerSkipped: (n: number): string =>
      `Answer the ${n === 1 ? "one" : n} you skipped`,
    answerSkippedEarlier: (n: number): string =>
      `Answer the ${n === 1 ? "one" : n} you skipped last time`,
    another: "Another idea",
    back: "Back to Studio",
  },

  /**
   * A new idea as one bundle (ST26): what it is, its questions swiped
   * between and each said and heard back, then the whole idea looked over
   * and sent together. Voice going wrong is said as what you meant to do,
   * never how it failed; typing is marked as the fallback it is.
   */
  bundle: {
    heading: "New idea",
    back: "Back to Studio",
    backLabel: "Back",
    reading: "Opening your idea…",
    unreadable:
      "What this phone keeps for ideas couldn't be read, so nothing new can be kept yet.",
    readAgain: "Try again",
    about: {
      heading: "What is it?",
      dated: (iso: string): string =>
        `${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · dated for you`,
      madeFor: "Made for",
      formats: {
        short: "Short · vertical",
        video: "Video · wide",
      } satisfies Record<IdeaFormat, string>,
      title: "Title",
      titleHint: "A few words you'll know it by",
      titleLeft: (n: number): string =>
        `${n} character${n === 1 ? "" : "s"} left`,
      topic: "Subject",
      keywords: "Keywords",
      pickAny: "pick any",
      start: "Start the questions",
    },
    questionOf: (n: number, of: number): string => `Question ${n} of ${of}`,
    canWait: "you can leave this one",
    needed: "This one is needed before the idea can go home.",
    swipeOn: "Swipe on to leave it for now.",
    /** Each dot above the cards, for a screen reader. */
    dot: {
      said: (n: number): string => `Question ${n}, said`,
      typed: (n: number): string => `Question ${n}, typed`,
      failed: (n: number): string =>
        `Question ${n}, your voice didn't come through`,
      later: (n: number): string => `Question ${n}, left for later`,
      open: (n: number): string => `Question ${n}, not said yet`,
    },
    prev: (n: number): string => `← ${n}`,
    next: (n: number): string => `${n} →`,
    last: "Last one",
    failed: {
      title: "You wanted to say this. Your voice didn't come through.",
      line: "Nothing was kept. Try again, or come back to it later.",
      again: "Try saying it again",
      later: "Come back later",
      type: "Type it this once",
    },
    typing: {
      mark: "Typing instead · voice didn't work",
      hint: "A few words are enough. You can say it properly later.",
      left: (n: number): string => `${n} character${n === 1 ? "" : "s"} left`,
      voice: "Try voice again",
      keep: "Keep these words",
    },
    typed: {
      mark: "Typed, because voice didn't work",
      sayInstead: "Say it instead",
    },
    later: {
      line: "Left for later. It's marked on the dots above, and the idea won't go home without what it needs.",
      sayNow: "Say it now",
    },
    saidCount: (n: number, of: number): string =>
      `${n} of ${of} answered · all on this phone until you send`,
    toReview: "Look it over before sending",
    review: {
      noTitle: "No title yet",
      change: "Change",
      kept: "Kept on this phone only. Nothing has been sent.",
      playAll: "Play all, in order",
      stopAll: "Stop",
      deleteAll: "Delete all",
      notSaid: "Not said yet",
      typed: "Typed, because voice didn't work",
      sayIt: "Say it",
      delete: "Delete",
      needsTitle: "Give it a title to send it.",
      needsFirst: "Say what the video is to send it.",
      away: "Home is out of reach. Send keeps the idea here, whole, and it goes home when you're back in reach.",
      unpaired:
        "This phone isn't paired with home. Send keeps the idea here, whole, and it goes home once it is.",
      send: (n: number): string =>
        `Send the idea home · ${plural(n, "answer", "answers")}`,
    },
    confirm: {
      answerTitle: "Delete this answer?",
      answerLine: (ask: string): string =>
        `“${ask}” hasn't left this phone, so deleting it removes it for good. You can say it again.`,
      allTitle: "Delete the whole idea?",
      allLine:
        "None of it has left this phone, so its title and every answer are removed for good.",
      yes: "Delete for good",
      keep: "Keep it",
    },
    notice: {
      deleted: TAKE_WORDS.discarded,
      deletedAll: TAKE_WORDS.discarded,
      notKept:
        "This phone couldn't keep that change, so it would be lost if you left now.",
      notSent:
        "This phone couldn't keep the idea, so nothing was sent. It's all still here.",
      notDeleted: "That couldn't be deleted, so it's still here.",
    },
    sent: {
      title: "Sent, as one idea",
      near: "Kept on this phone as one idea, dated. What you said goes home now, and its title and the rest follow once home keeps ideas.",
      away: "Kept on this phone as one idea, dated. It goes home when you're back in reach.",
      unpaired:
        "Kept on this phone as one idea, dated. It goes home once this phone is paired with home.",
      another: "Another idea",
    },
  },

  /**
   * The idea shelf (ST19): every idea kept, and one at a time moved on a
   * step, from just the idea to a video, or set aside, never let go.
   */
  shelf: {
    heading: "Your ideas",
    open: "Your ideas",
    openLine: "Every idea you caught, and where each one is.",
    unreadable:
      "The ideas kept on this phone couldn't be read, so none can be shown yet.",
    none: "No ideas kept yet. Catch one with New idea, the moment it comes.",
    stage: {
      idea: "Just the idea",
      fleshed: "Fleshed out",
      video: "A video",
      aside: "Set aside",
    } satisfies Record<IdeaStage, string>,
    waiting: (n: number): string =>
      `Claude asked ${n === 1 ? "a question" : `${n} questions`}`,
    asideCount: (n: number): string => `Set aside · ${n}`,
    showAll: "Back to your ideas",
    openIdea: "Open",
    yourAnswers: "Your answers",
    claudeAsked: "Claude asked",
    notAnswered: "Not answered yet",
    skipped: "Skipped",
    share: "Share with Claude",
    sharing: "Preparing…",
    /** What the share sheet calls what goes out. */
    shareTitle: "Studio idea",
    shareLine:
      "Your answers, as text, for Claude to turn into scenes. Then ask Claude in a session, and open what Claude sends back here.",
    shareAgainLine:
      "You've answered since Claude last saw it. Share it with Claude again.",
    openReply: "Open what Claude made of it",
    openReplyHint:
      "The scenes Claude made from your answers, or Claude's questions about the idea.",
    answer: (n: number): string =>
      `Answer Claude's ${n === 1 ? "question" : `${n} questions`}`,
    answerLine: "By voice or typed, one at a time, like the idea itself.",
    scenes: (n: number): string => `Claude's scenes · ${n}`,
    fromYou: "From your answers",
    fromClaude: "Claude's own idea",
    make: "Make this a video",
    making: "Making it…",
    makeLine:
      "Starts a video in Studio with these scenes as its first version, linked back to this idea.",
    openVideo: "Open it in Studio",
    videoLine: "A video in Studio began with this idea.",
    setAside: "Set it aside",
    setAsideLine: "It stays kept, out of the way. Bring it back any time.",
    bringBack: "Bring it back",
    back: "Your ideas",
    backToIdea: "Back to the idea",
    answered:
      "Claude's questions are answered and kept as text on this phone. Share the idea with Claude again.",
    /** Claude's questions met, `n` of them skipped (ST19). */
    answeredSkipping: (n: number): string =>
      `Your answers are kept as text on this phone. ${n === 1 ? "The question you skipped stays" : `The ${n} you skipped stay`} with the idea, to answer any time.`,
    askedOf: (n: number, of: number): string =>
      `Claude's question ${n} of ${of}`,
    askedHint: "Claude asked this about your idea.",
    firstVersion: (title: string): string => `From your idea: ${title}`,
    /** In place of Make this a video while the phone's videos can't be read. */
    videosUnread:
      "The videos on this phone couldn't be read, so whether this idea is one yet isn't known. Read them again.",
    notice: {
      notKept: "That couldn't be kept on this phone, so nothing changed.",
      notReply:
        "That isn't Claude's reply about an idea. Ask Claude for it again.",
      otherIdea:
        "That's Claude's reply about another idea. Open it from that idea.",
      wrongReply:
        "Part of Claude's reply is missing, or it cites answers this idea doesn't have. Ask Claude for it again.",
      unreadableFile: "That couldn't be opened. Pick it again.",
      replied: "Claude's scenes are kept with the idea.",
      alreadyKept: "That's kept with the idea already, so nothing changed.",

      asked:
        "Claude's questions are kept with the idea. Answer them when you're ready.",
      made: "It's a video now, in Studio. The idea and every answer stay here.",
      notMade: "The video couldn't be started, so nothing changed. Try again?",
      aside: "Set aside. It stays kept.",
      back: "Back with your ideas.",
    } satisfies Record<ShelfNotice, string>,
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
