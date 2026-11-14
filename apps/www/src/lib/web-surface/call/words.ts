/**
 * Every word the call's stage shows besides the week's own data and the
 * format's section names, in one table.
 */
export const CALL_WORDS = {
  title: "The weekly call",
  sample: "Sample week",
  read: "Read at",
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
  page: (n: number, of: number): string => `page ${n} of ${of}`,
  part: (n: number, of: number): string => `Part ${n} of ${of}`,
  more: (n: number): string => (n === 1 ? "and 1 more" : `and ${n} more`),
  unread: "This week's call couldn't be read, so this is the sample instead.",
  missing: (from: string): string =>
    `There's no call for the week of ${from}: this is the newest instead.`,
  promise: "Promise",
  chapter: (title: string): string => `Chapter: ${title}`,
  items: (n: number): string => (n === 1 ? "1 of them" : `${n} of them`),
} as const
