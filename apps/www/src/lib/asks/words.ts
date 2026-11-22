/**
 * Every word the Asks page says (`routes/_dashboard/_lan/asks.tsx`), in the
 * owner's terms: what waits on them, what each choice or step lets go
 * ahead, and where what they do is kept (this tab, until they copy it).
 * `./__tests__/words.test.ts` holds that none names the machinery.
 */
import type { WorkRepo } from "@some-ui/video-render"

export const ASKS_WORDS = {
  title: "Asks",
  intro:
    "What waits on you: decisions only you can make, and checklists of steps only you can take, such as setting up a key. Each is an issue on GitHub, and it leaves this page once that issue is closed.",
  kept: "What you choose, tick off and paste here stays in this tab, and goes when you close it. Anything that looks like a key or a password is blanked before it's kept. Copy the receipt into the session working on the ask to hand it over.",
  reading: "Reading what waits on you…",
  away: "The asks couldn't be read. Try again in a moment.",
  stale: "The asks couldn't be read again, so this is what was read before.",
  tryAgain: "Try again",
  none: "Nothing waits on you.",
  from: {
    "some-ui": "About the apps",
    server: "About home",
  } satisfies Record<WorkRepo, string>,
  kind: { decision: "A decision", checklist: "A checklist" },
  unread: "This ask can't be read here. Its page on GitHub says what it asks.",
  open: "Its page on GitHub",
  whyYours: "Why it's yours",
  options: "The options",
  recommended: "Recommended",
  unblocks: (what: string): string => `Unblocks ${what}`,
  whenDone: (what: string): string => `When every step is done: ${what}`,
  choose: "Choose this",
  chosen: "You chose this",
  note: "Anything to add (optional)",
  step: (place: number, of: number): string =>
    `Step ${String(place + 1)} of ${String(of)}`,
  where: (where: string): string => `Where: ${where}`,
  paste: "Paste it here (optional)",
  done: "Done",
  doneAgain: "Done again",
  isDone: "Done",
  receipt: "Receipt",
  copyWhat: "the receipt",
  receiptHolds: (n: number): string =>
    `It holds ${n === 1 ? "one thing" : `${String(n)} things`} you did here, ready to copy.`,
  stepsDone: (done: number, of: number): string =>
    `${String(done)} of ${String(of)} steps done`,
} as const
