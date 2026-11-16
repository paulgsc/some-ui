/**
 * Every word the interview essay's stage shows besides the essay's own data
 * and the format's scene names, in one table (`./essay-words` is the Rust
 * essay's).
 */
export const INTERVIEW_ESSAY_WORDS = {
  title: "Interview week",
  sample: "Sample essay",
  chapter: (title: string): string => `Chapter: ${title}`,
  invented: "Invented for the week",
  role: "The role",
  guidelines: "A good answer covers",
  youSaid: "You said",
  youRead: "You read",
  noAnswer: "Nothing came for this one",
  noRead: "Not read",
  counted: "Counted",
  judged: "Judged against the guidelines",
  noFaults: "Nothing counted or judged stood out",
  model: "One way to answer it, made apart from yours",
  guideline: "Guideline",
  yours: "Yours",
  unanswered: "No answer",
  situation: "Where it's given",
  script: "The script",
  change: "What to change",
  answers: "Answers",
  reads: "Reads",
  noTake: "–",
  noScore: "Counts as they were, week by week. No score.",
  comesBackTo: "Comes back to",
} as const
