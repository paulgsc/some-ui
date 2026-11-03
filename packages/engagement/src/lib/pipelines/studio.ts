/**
 * Studio's pipelines: the video made in sittings on the phone, game-day
 * bites, and the Playoff Delta stage on the desktop web.
 */
import type { Pipeline } from "@engagement/lib/registry"

/** The video, made in sittings, scene by scene (`packages/ui/soundbites`, ST4). */
const studio: Pipeline = {
  id: "studio",
  name: "Studio",
  wing: "studio",
  domain: "video",
  affordances: [
    // Studio's Home: the video kept on this phone, opened for a sitting.
    {
      id: "sitting",
      surface: "apk",
      name: "A sitting on the video",
      routes: ["/journal"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over", "left"],
      touches: true,
      // The Studio screens a sitting can stop on (`lib/studio/machine.ts`).
      places: [
        { id: "start", name: "The video's start" },
        { id: "record", name: "Recording a scene" },
        { id: "shape", name: "Shaping its look and voice" },
        { id: "watch", name: "Watching the review" },
        { id: "finish", name: "Finish" },
        { id: "show", name: "The show" },
      ],
    },
    // Record: the scene on screen, offered for a take.
    {
      id: "take",
      surface: "apk",
      name: "A take of a scene",
      routes: ["/journal"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Watch: a note pinned to a moment of the review render (ST5).
    {
      id: "watch-note",
      surface: "apk",
      name: "A note on the review",
      routes: ["/journal"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Finish: ready for YouTube, or the one thing missing (ST7).
    {
      id: "finish",
      surface: "apk",
      name: "Finish for YouTube",
      routes: ["/journal"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // "How did it go?", asked as a sitting ends (`Friction`'s `went`). What
    // got in the way is the owner's words and stays in Studio's own report.
    {
      id: "how-did-it-go",
      surface: "apk",
      name: "How did it go?",
      routes: ["/journal"],
      offer: "listed",
      emits: ["offered", "said", "passed-over"],
      touches: false,
      answers: [
        { id: "smooth", name: "Smooth" },
        { id: "snags", name: "Some snags" },
        { id: "rough", name: "Rough" },
      ],
    },
    // New idea (ST26): from Studio's Home and the launcher's shortcut.
    {
      id: "new-idea",
      surface: "apk",
      name: "New idea",
      routes: ["/journal", "/journal/idea"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
    // Your ideas (ST19): every idea kept, and where each is.
    {
      id: "your-ideas",
      surface: "apk",
      name: "Your ideas",
      routes: ["/journal", "/journal/ideas"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/** Game day: tap what is happening and say it (`packages/ui/game-week`, GWB6). */
const gameDay: Pipeline = {
  id: "game-day",
  name: "Game day",
  wing: "studio",
  domain: "video",
  affordances: [
    // A scenario card home offers for the game being watched; a newer offer
    // takes it back ("offer-changed").
    {
      id: "scenario",
      surface: "apk",
      name: "A moment to say something about",
      routes: ["/game-week"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: true,
    },
  ],
}

/** The Playoff Delta stage, recorded on the desktop (`packages/ui/playoff-delta`). */
const playoffDelta: Pipeline = {
  id: "playoff-delta",
  name: "Playoff Delta",
  wing: "studio",
  domain: "video",
  affordances: [
    // Studio's web Home is the stage itself: nothing offers it, the owner
    // goes to it to record a week.
    {
      id: "stage",
      surface: "web",
      name: "Record a week on the stage",
      routes: ["/playoff-delta"],
      offer: null,
      emits: ["taken"],
      touches: true,
    },
  ],
}

export const STUDIO: ReadonlyArray<Pipeline> = [studio, gameDay, playoffDelta]
