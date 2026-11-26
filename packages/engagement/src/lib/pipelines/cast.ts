/** Cast: the two characters' looks, previewed on the phone (HOST8, #3532). */
import type { Pipeline } from "@engagement/lib/registry"

const cast: Pipeline = {
  id: "cast",
  name: "Cast",
  wing: "cast",
  // The looks a video's scenes are drawn with: previewing them is not making
  // one, so nothing here touches the videos.
  domain: "video",
  opened: { kind: "not-measured", why: "Nothing of it is counted yet." },
  affordances: [
    // The grid: every way a character can feel, each a live loop.
    {
      id: "looks",
      surface: "apk",
      name: "Every look",
      routes: ["/cast"],
      offer: null,
      emits: ["taken"],
      touches: false,
    },
    // One look, in each shot and corner, over a sample card.
    {
      id: "a-look",
      surface: "apk",
      name: "A look in every shot",
      routes: ["/cast", "/cast/look"],
      offer: "listed",
      emits: ["offered", "taken", "passed-over"],
      touches: false,
    },
  ],
}

export const CAST: ReadonlyArray<Pipeline> = [cast]
