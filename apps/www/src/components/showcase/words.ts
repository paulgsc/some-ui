/** Public copy; source excerpts live in evidence.ts and retain their exact words. */
export const WORDS = {
  name: "Paul Gathondu",
  edition: "A working notebook / some-ui",
  nav: "Inside the work",
  voiceLink: "01 / Voice",
  questionsLink: "02 / Decisions",
  timelineLink: "03 / Over time",
  eyebrow: "APPLICATIONS I BUILD & LIVE IN",
  title: "I build it.",
  titleEnd: "I live in it.",
  intro:
    "I build applications for my own working life. I use them, consume what they make, and decide how they should behave.",
  decision: "Claude writes the code. I work at the decision layer.",
  down: "Start with voice ↓",
  voiceNumber: "01 / THE INTERFACE I KEEP COMING BACK TO",
  voiceTitle: "I want to talk\nto my tools.",
  voiceIntro:
    "I record ideas in takes. I turn a week of work into a call, and learning material into spoken essays. A conversation with the application is where I want to go next.",
  sample: "BUNDLED SAMPLE / CONFERENCE CALL",
  sampleTitle: "A week, spoken back.",
  sampleNote:
    "These are the template’s sample words. The stage shows the scenes and their script; it does not play a recording of me.",
  motionOpen: "Scrub the video’s opening",
  motionTitle: "The actual brand-v1 composition",
  motionSeek: "Move through the opening",
  motionStill: "Reduced motion: the finished frame.",
  stageOpen: "Open the sample stage",
  stageTitle: "The weekly call — sample scenes",
  stageClose: "Close the stage by folding this panel.",
  stageLink: "Explore the call →",
  essayLink: "Read the sample essay →",
  takesTitle: "Capture → keep → make",
  takesBody:
    "I keep voice takes and idea answers in Studio. The weekly call brings together what landed, gray-area calls, and what is waiting on me.",
  source: "Read the source →",
  questionsNumber: "02 / THE DECISION LAYER",
  questionsTitle: "The questions behind\nthe applications.",
  questionsIntro:
    "I want the decisions to leave something I can inspect. Open a question to see what holds it.",
  assuranceQuestion: "How do I know when it’s broken?",
  assuranceBody:
    "I keep a ledger of promises, evidence, and gaps. These are repository verdicts, not a live health check.",
  ledgerLabel: "PROMISES / FROM THE REPOSITORY AT BUILD TIME",
  holds: "holds",
  gaps: "other verdicts",
  total: "objectives",
  ledgerLink: "Inspect the assurance ledger →",
  driftQuestion: "How do I keep decisions from drifting?",
  driftBody:
    "I give rules a falsifier. Gray-area calls keep who chose, the options, and a way back. Here is a real call record.",
  idiomQuestion: "How do I hold an idiom in code?",
  idiomBody:
    "I put a check behind it. The gesture rule keeps touch handling in the shared pager and pull-refresh runtimes.",
  mathQuestion: "What am I modelling when I teach?",
  mathBody:
    "I keep the assumptions in a mathematical canon. This definition names the hidden state; the next axiom says the system cannot observe it directly.",
  timelineNumber: "03 / THE WORK CHANGES",
  timelineTitle: "What I kept.\nWhat I left behind.",
  timelineNote:
    "Dated changes from the repository. The last entry is a direction, with work still waiting.",
  timeline: [
    {
      date: "06 NOV 2026",
      title: "The call reaches Studio.",
      body: "I can watch and share the weekly call’s video from the phone.",
      commit: "fe108e8f",
    },
    {
      date: "09 NOV 2026",
      title: "An essay gets a stage.",
      body: "The Rust Rounds essay has a template I can inspect in the browser.",
      commit: "68f9ba72",
    },
    {
      date: "13 NOV 2026",
      title: "A speech service retires.",
      body: "I leave the openai-edge-tts service behind.",
      commit: "01c164ba",
    },
    {
      date: "14 NOV 2026",
      title: "Cards become spoken essays.",
      body: "A podcast has an intro and a chapter per scene.",
      commit: "037c1640",
    },
  ],
  next: "NEXT / STILL A PLAN",
  nextTitle: "A session is a conversation.",
  nextBody:
    "I want to speak to the application itself. The turn pattern exists; a live model is still an open decision.",
  footer: "Built for my life. Open for a closer look.",
  resume: "Résumé →",
  repo: "Source →",
  mission: "Why I build this →",
} as const

/** Only a public recording supplied by the owner may fill this slot. */
export type PublicOwnerVoice = {
  src: string
  transcript: string
  label: string
}
export const OWNER_VOICE: PublicOwnerVoice | null = null
