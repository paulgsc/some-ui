/**
 * What deleting the account removes, and what it leaves, in the words the
 * Account screen shows above the button that deletes.
 *
 * Pure, and the one place those words live, so they stay in the person's
 * terms (what is kept where) and never the machinery's
 * (`__tests__/account-erases.test.ts`). `paulgsc/server` `docs/identity.md`,
 * "What deleting an account erases", lists each kind below and the tables
 * under it, and its test fails when a table has no kind there: a kind added
 * to that list is added here, which no test in this repository can see.
 *
 * Home's copy of a Jobs mailbox file is the only one once the mailbox has let
 * the file go (invariant 21), which is why the mailbox's files are named, the
 * archived ones included. A file still live in the mailbox is not reached: home
 * keeps nothing and archives nothing for a subject with no account, so nothing
 * there removes it afterwards.
 */

/** One kind of thing, named, and said in a sentence. */
export type Kind = { readonly label: string; readonly text: string }

export const ACCOUNT_ERASES = {
  lead: "Deleting removes everything home keeps under this account, and can't be undone.",
  goesTitle: "What goes",
  goes: [
    {
      label: "Sessions",
      text: "Your study sessions, and when you started and finished each.",
    },
    {
      label: "Saved shelf items",
      text: "The items you chose to keep on a shelf, word for word.",
    },
    {
      label: "Reminders and progress",
      text: "How far you got in each session, which session you had open, which browsers can be reminded, and when a reminder was sent.",
    },
    {
      label: "aph",
      text: "Every entry and every change to it, with your checkpoints, goals and labels.",
    },
    {
      label: "The Jobs record",
      text: "Each pick you took, passed on or archived and why, how applying went, and what came of it.",
    },
    {
      label: "Jobs mailbox files home holds",
      text: "The daily job picks, word sets, dramas and run records home holds for you, the ones it archived out of the mailbox included. Once the mailbox has let a file go, home's copy is the only one, so it goes too.",
    },
    {
      label: "Filed with home for the mailbox",
      text: "The decisions and scouts you filed with home, which lessons you opened, and home's note of each one it passed on.",
    },
    {
      label: "LeetType sessions",
      text: "Each session you played: your picks, how long each took, and how it ended.",
    },
    {
      label: "What your phones share",
      text: "What each paired phone chose to keep sending home, and when it chose.",
    },
    {
      label: "Sign-in",
      text: "Your passkeys, and every sign-in on this device and on each paired phone, so none of them opens anything here.",
    },
  ],
  staysTitle: "What stays",
  stays: [
    {
      label: "On your phones",
      text: "What each phone holds stays on that phone.",
    },
    { label: "In Drive", text: "Your Drive copies." },
    {
      label: "In the Jobs mailbox",
      text: "Files still in the mailbox stay until you remove them there, because deleting here doesn't reach it. For each file it has let go, the mailbox keeps a note of its name, size and dates, never what was in it.",
    },
    {
      label: "Logs and backups",
      text: "Home's logs and backups are not rewritten.",
    },
  ],
} as const satisfies {
  readonly lead: string
  readonly goesTitle: string
  readonly goes: ReadonlyArray<Kind>
  readonly staysTitle: string
  readonly stays: ReadonlyArray<Kind>
}
