/**
 * Each browser extension, and whether it has an offer worth measuring (ENG1,
 * epic #2533: "the browser extensions" are not in the epic; any that has one
 * gets its own story). Ids are the extensions' folders under `extensions/`,
 * as the extensions comb names them
 * (`packages/ui/honeycomb/src/components/extensions-comb/extensions.data.ts`).
 */
export type ExtensionVerdict = {
  readonly id: string
  readonly name: string
  /** Whether it puts something in front of the owner to take or pass over. */
  readonly offer: "worth-measuring" | "none"
  readonly why: string
}

export const EXTENSIONS: ReadonlyArray<ExtensionVerdict> = [
  {
    id: "suspender-ledger",
    name: "Suspender Ledger",
    offer: "none",
    why: "It works by itself: idle tabs go quiet and come back on a click, with nothing offered to take or pass over.",
  },
  {
    id: "some-filter",
    name: "Page Filter",
    offer: "none",
    why: "It changes how every page looks, all the time; there is no offer to take.",
  },
  {
    id: "some-censor",
    name: "BOYO",
    offer: "none",
    why: "Each tap uncovers a video a little more, so the taps are its use, but they serve no domain that coming back would build.",
  },
  {
    id: "some-mujik",
    name: "Music Overlay",
    offer: "none",
    why: "An idea, not built yet: nothing is offered.",
  },
  {
    id: "some-drama",
    name: "Drama Overlay",
    offer: "worth-measuring",
    why: "A scene playing is an offer to log how it hit you, and a scene with no beat logged is passed over; it makes the stream's reaction, so it is Studio's kind of making. It talks to no home yet, so its story starts there.",
  },
]
