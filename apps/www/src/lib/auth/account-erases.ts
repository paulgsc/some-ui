/**
 * What deleting the account removes and leaves, in the words the Account
 * screen shows above the delete button. Mirrors `paulgsc/server`
 * `docs/identity.md`, "What deleting an account erases": a kind added there is
 * added here, and no test in this repository can see it. A mailbox file still
 * live stays because home keeps and archives nothing for an account that is gone
 * (`mailbox::pass`), not because it ages out.
 */

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
} as const
