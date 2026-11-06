/**
 * Every word the call's stage shows besides the week's own data and the
 * format's section names, in one table.
 */
export const CALL_WORDS = {
  title: "The weekly call",
  sample: "Sample week",
  read: "Read at",
  previous: "Previous",
  next: "Next",
  scenes: "Scenes",
  status: {
    decide: "Waits on you",
    open: "Open",
    doing: "Under way",
    done: "Done",
  },
  waiting: (n: number): string =>
    n === 1 ? "1 waits on you" : `${n} wait on you`,
  change: { story: "Story", defect: "Defect" },
  landed: "Landed",
  nextUp: "Next",
  chose: "Chose",
  why: "Why",
  undo: "To undo it",
  whyYours: "Why it's yours",
  recommended: "Recommended",
  unblocks: "Unblocks",
  later: "Also waiting on you",
  promise: "Promise",
} as const
