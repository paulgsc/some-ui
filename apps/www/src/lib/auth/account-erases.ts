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
      label: "Telling the phone a morning run is in",
      text: "Which phones asked to be told when the morning run is in, and which runs home told them of.",
    },
    {
      label: "Mailbox files home holds",
      text: "The daily job picks, word sets, dramas, LeetType session files and run records home holds for you, the ones it archived out of the mailbox included. Once the mailbox has let a file go, home's copy is the only one, so it goes too.",
    },
    {
      label: "Filed with home for the mailbox",
      text: "The decisions and scouts you filed with home, which lessons you opened, what home heard in your voice notes, how each LeetType session went, your written reflections, the scenes you asked for, your notes on the feeds' episodes, and home's note of each one it passed on.",
    },
    {
      label: "LeetType sessions",
      text: "Each session you played: your picks, how long each took, and how it ended.",
    },
    {
      label: "Korean's word sets and reading records",
      text: "Every word set your phone sent home, and what it kept as you read: how long each word is given, how often each sentence was shown and read to the end, your grammar lens answers, your practice record, where you left off and your answers at a sitting's end, every change to them included.",
    },
    {
      label: "Written reflections",
      text: "Each reflection you typed about a session and your phone sent home, word for word, with when you wrote it.",
    },
    {
      label: "Asks for the next scene",
      text: "Each next scene you asked for and your phone sent home, word for word, with when you asked.",
    },
    {
      label: "Notes on the feeds' episodes",
      text: "Each note you left at a moment of an episode and your phone sent home: which episode, the moment, what you picked about it, the take you said for it if any, and when you wrote it.",
    },
    {
      label: "Conversation essays' records",
      text: "Each conversation's record: the topic and points you gave, each podcast version, your flags, the green light, the emotion notes, and each preview you picked or answered in your own words.",
    },
    {
      label: "Voice notes, recordings from a game included",
      text: "Each voice note your phone sent home, its sound included, and what home heard in it; for a recording from a game, also what it was about and what the screen showed as you said it.",
    },
    {
      label: "What the phone noted beside a soundbite or a LeetType answer",
      text: "When each soundbite was recorded and what your phone noted around it, and for each LeetType spoken answer, its prompt and rubric, the points you ticked and what you typed.",
    },
    {
      label: "Rust Rounds' rounds",
      text: "Each round sent home, as the tutor wrote it: its cards, which of your voice notes a card answered, and the tutor's nudges; and the time your phone tracked you working on a week: when it started and stopped, the ticket, step and points, the name your phone gave itself, and how much of it you said was work.",
    },
    {
      label: "Rust Rounds' essay videos",
      text: "Each week's essay video home made from your takes, the YouTube links you saved for it, and the note of each one that went from home: when, why and how big.",
    },
    {
      label: "Interview weeks' essay videos",
      text: "The same for each week of mock interview's essay: its video home made from your takes, its YouTube links, and the note of each one that went.",
    },
    {
      label: "Cards essays withdrawn for your takes",
      text: "Which cards essays' videos went from home for good because a recording one of their spoken cards played was deleted or let go, and which recording it was.",
    },
    {
      label: "How each recording ended",
      text: "For each recording your phone sent home a note of: which screen it was on, whether it was kept, stopped or failed, how long the microphone took to open, how long it ran and how loud it got. Never the sound or what you said.",
    },
    {
      label: "Each week's engagement report",
      text: "The counts home kept for each week's engagement report, what you used and how often, as it wrote them for the video, and that video's YouTube links and what you let go. Never a time of day, an answer or anything you said.",
    },
    {
      label: "Studio's time log",
      text: "When each Studio screen was open in a sitting, and how each sitting went: what got in the way, and the scene you were on.",
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
      label: "In the mailbox",
      text: "Files still in the mailbox stay until you remove them there, because deleting here doesn't reach it. For each file it has let go, the mailbox keeps a note of its name, size and dates, never what was in it.",
    },
    {
      label: "Rust Rounds' programs",
      text: "Home's copy of each Rust Rounds program, what rustc printed for it, and when the first round holding it reached home. They are kept by their code alone, linked to no one once your rounds are gone.",
    },
    {
      label: "Cards essays",
      text: "Each cards essay's cards, and the YouTube link saved for it. A video home already made from one stays as it is, your takes' voices included.",
    },
    {
      label: "Logs and backups",
      text: "Home's logs and backups are not rewritten.",
    },
  ],
} as const
