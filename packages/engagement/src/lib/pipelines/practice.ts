/**
 * Practice's pipelines: study sessions and their ways in, Bites, TOPIK, Rust
 * Rounds, LeetType and Hangul Honeycomb. Each affordance is read off the
 * screen that offers it; the comment above each names where.
 */
import type { Choice, Pipeline } from "@engagement/lib/registry"

/**
 * Where a read-aloud set can be left: the set machine's phases
 * (`packages/ui/topik/src/lib/topik/read-aloud/set-machine`), in the
 * owner's words. `paused` and `sitting-over` are not places: a pause is not
 * a stop, and a sitting that ran its time is the set's own end.
 */
const READ_ALOUD_PLACES: ReadonlyArray<Choice> = [
  { id: "letters", name: "Reading the letters" },
  { id: "your-turn", name: "Your turn to say it" },
  { id: "listening", name: "Listening to it said" },
  { id: "echo", name: "Saying it back" },
  { id: "meaning", name: "Its meaning" },
  { id: "summary", name: "The set's summary" },
]

/** The session player's routes, where an activity is offered and played. */
const SESSION_ROUTES = ["/app", "/sessions/new", "/sessions/$sessionId"]

/** lib/session-stop's REASONS, by the same ids. */
const STOP_REASONS: ReadonlyArray<Choice> = [
  { id: "break", name: "Break’s over" },
  { id: "person", name: "Someone needs me" },
  { id: "call", name: "Call or message" },
  { id: "move", name: "On the move" },
  { id: "focus", name: "Can’t focus" },
  { id: "other", name: "Something else" },
]

/** Where a study session starts and picks up, before any one activity. */
const study: Pipeline = {
  id: "study",
  name: "Study sessions",
  wing: "practice",
  domain: "practice",
  affordances: [
    // Practice Home's study card: Start, or Another round once one is done.
    {
      id: "start",
      surface: "apk",
      name: "Start a session",
      routes: ["/practice", "/sessions/new"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // The same card's Resume, or Pick up after a stop.
    {
      id: "resume",
      surface: "apk",
      name: "Resume the open session",
      routes: ["/practice", "/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // The Study tab: every session, any one opened again.
    {
      id: "session-list",
      surface: "apk",
      name: "Your sessions",
      routes: ["/sessions"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // The reminder that a session is waiting (lib/study-nudge, native).
    {
      id: "reminder",
      surface: "apk",
      name: "A reminder that a session is waiting",
      routes: [],
      offer: "notified",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // Why a session stopped short, on Home and in the player
    // (lib/session-stop's REASONS).
    {
      id: "stop-reason",
      surface: "apk",
      name: "Why you stopped",
      routes: ["/practice", "/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "said", "passed-over"],
      touches: false,
      answers: STOP_REASONS,
    },
    // The web's Home and Sessions: a new session, through the composer.
    {
      id: "start",
      surface: "web",
      name: "Start a session",
      routes: ["/app", "/sessions", "/sessions/new"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    {
      id: "session-list",
      surface: "web",
      name: "Your sessions",
      routes: ["/sessions"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // The browser's reminder (lib/study-nudge, service worker).
    {
      id: "reminder",
      surface: "web",
      name: "A reminder that a session is waiting",
      routes: [],
      offer: "notified",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    {
      id: "stop-reason",
      surface: "web",
      name: "Why you stopped",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "said", "passed-over"],
      touches: false,
      answers: STOP_REASONS,
    },
  ],
}

/**
 * Bites: what the owner says about studying, in their own voice. The words
 * stay in the bite; only that one was offered or said goes here.
 */
const bites: Pipeline = {
  id: "bites",
  name: "Bites",
  wing: "practice",
  domain: "reflection",
  affordances: [
    // "Not today? Say why", beside the study card; it opens Bites listening.
    {
      id: "say-why",
      surface: "apk",
      name: "Not today? Say why",
      routes: ["/practice", "/soundbites"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // The Bites tab: a bite said about the day's studying.
    {
      id: "bite",
      surface: "apk",
      name: "A bite about studying",
      routes: ["/soundbites"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/**
 * TOPIK: on the phone the handheld lesson (`HandheldLesson`, inside the
 * player), on the desktop the conversation and its quiz (`DesktopSession`).
 */
const topik: Pipeline = {
  id: "topik",
  name: "TOPIK",
  wing: "practice",
  domain: "korean",
  affordances: [
    // Practice Home's Next lesson.
    {
      id: "next-lesson",
      surface: "apk",
      name: "Next lesson",
      routes: ["/practice", "/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Practice Home's Pick a portion, and the lesson's own: "What are you
    // hungry for?"
    {
      id: "hungry",
      surface: "apk",
      name: "What are you hungry for?",
      routes: ["/practice", "/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
    // The one thing that menu serves for the size asked (core/portion).
    {
      id: "portion",
      surface: "apk",
      name: "A portion served",
      routes: ["/sessions/$sessionId"],
      offer: "served",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "From the routine": a scene's read-aloud set.
    {
      id: "routine-read-aloud",
      surface: "apk",
      name: "A routine scene, read aloud",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: READ_ALOUD_PLACES,
    },
    // "From the routine": the same scene's grammar lens set.
    {
      id: "routine-lens",
      surface: "apk",
      name: "A routine scene, through the grammar lens",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: READ_ALOUD_PLACES,
    },
    // "From the routine": a drama.
    {
      id: "routine-drama",
      surface: "apk",
      name: "A drama from the routine",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "Ready for you": a word set added and not opened yet.
    {
      id: "ready-set",
      surface: "apk",
      name: "A word set ready for you",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: READ_ALOUD_PLACES,
    },
    // "Start from a drama": the dramas home serves (adapter/tree-feed).
    {
      id: "served-drama",
      surface: "apk",
      name: "A drama from home",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // A drama asked of a model and pasted back (GenerateLesson's steps).
    {
      id: "paste-drama",
      surface: "apk",
      name: "Make a drama with a model",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: [
        { id: "copy-prompt", name: "Copying the prompt" },
        { id: "paste-reply", name: "Pasting its reply" },
      ],
    },
    {
      id: "kept-drama",
      surface: "apk",
      name: "A drama you kept",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Asking about a scene (AskScene).
    {
      id: "ask-scene",
      surface: "apk",
      name: "Ask about a scene",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "About the sentences", at the end of a read-aloud sitting
    // (read-aloud/feedback's two answers).
    {
      id: "sentence-feedback",
      surface: "apk",
      name: "About the sentences",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "said", "passed-over"],
      touches: false,
      answers: [
        { id: "too-easy", name: "Too easy" },
        { id: "too-many-repeats", name: "Too many repeats" },
      ],
    },
    // The desktop: a conversation, offered on Home's launcher and the
    // composer's picker, played and then quizzed.
    {
      id: "conversation",
      surface: "web",
      name: "A conversation to study",
      routes: SESSION_ROUTES,
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: [
        { id: "conversation", name: "The conversation" },
        { id: "quiz", name: "Its quiz" },
      ],
    },
    // The desktop's guided chat beside it.
    {
      id: "chat",
      surface: "web",
      name: "Ask the guide",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/** Rust Rounds on the phone (`packages/ui/rust-rounds`, #2235). */
const rustRounds: Pipeline = {
  id: "rust-rounds",
  name: "Rust Rounds",
  wing: "practice",
  domain: "rust",
  affordances: [
    // Practice Home's card: Continue where you left off, or Start.
    {
      id: "home-card",
      surface: "apk",
      name: "Rust Rounds on Practice Home",
      routes: ["/practice"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // The menu's "Pick a concept", Mixed among them.
    {
      id: "concept",
      surface: "apk",
      name: "A concept on the menu",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // The menu's Continue, back to the card on screen when it was left.
    {
      id: "continue",
      surface: "apk",
      name: "Continue where you left off",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "New from the tutor".
    {
      id: "from-the-tutor",
      surface: "apk",
      name: "New from the tutor",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "Notes to say again": a refine card.
    {
      id: "say-again",
      surface: "apk",
      name: "A note to say again",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // A card: read and choose, say it, see what rustc did.
    {
      id: "card",
      surface: "apk",
      name: "A card",
      routes: ["/rust-rounds"],
      offer: null,
      emits: ["taken", "left"],
      touches: true,
      places: [
        { id: "read", name: "Reading the program" },
        { id: "say-it", name: "Saying it" },
        { id: "rustc", name: "What rustc did" },
      ],
    },
    // Paste an error from the desk, from any card (RR4c).
    {
      id: "desk-paste",
      surface: "apk",
      name: "Paste an error from your desk",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    {
      id: "tutor",
      surface: "apk",
      name: "The tutor",
      routes: ["/rust-rounds"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/**
 * LeetType: session files on the phone (under 768px wide), the typing game on
 * the desktop. Its own session log (`session-log/model.ts`, epic #1908) maps
 * onto these in ENG5: `placed` is offered, `reading opened` taken,
 * `reading skipped` passed over, `returned` a parked round taken.
 */
const leetype: Pipeline = {
  id: "leetype",
  name: "LeetType",
  wing: "practice",
  domain: "algorithms",
  affordances: [
    {
      id: "session-file",
      surface: "apk",
      name: "A session file",
      routes: SESSION_ROUTES.filter((r) => r !== "/app"),
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      places: [
        { id: "round", name: "In a round" },
        { id: "reading", name: "In a reading" },
      ],
    },
    {
      id: "reading",
      surface: "apk",
      name: "A reading after a struggle",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    {
      id: "pointer",
      surface: "apk",
      name: "A pointer after a solved round",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    {
      id: "parked-round",
      surface: "apk",
      name: "A round you parked",
      routes: ["/sessions/$sessionId"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // The desktop's typing game, from the launcher or the composer.
    {
      id: "typing-game",
      surface: "web",
      name: "A typing round",
      routes: SESSION_ROUTES,
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/** Hangul Honeycomb: the desktop web's alone (`lib/web-surface`'s panel). */
const honeycomb: Pipeline = {
  id: "honeycomb",
  name: "Hangul Honeycomb",
  wing: "practice",
  domain: "korean",
  affordances: [
    {
      id: "game",
      surface: "web",
      name: "A game of Hangul Honeycomb",
      routes: SESSION_ROUTES,
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

export const PRACTICE: ReadonlyArray<Pipeline> = [
  study,
  bites,
  topik,
  rustRounds,
  leetype,
  honeycomb,
]
