/**
 * Rust Rounds' opening, the standing set (#3269, C737): up to three
 * questions someone who has never seen Rust Rounds would ask, and the
 * answers the owner reads to them through the teleprompter. It carries over
 * week to week. The routine never writes its words: once the routine writes
 * `/2` weeks (#3272), code copies it into each as it stands
 * (`openingOfWeek`); until then no week carries one. It changes only when
 * the owner asks, by a change to this file that raises `version`.
 *
 * A take answers the version it was recorded under. The essay reuses the
 * newest kept take of each answer while the week's opening is that version
 * (C736, home's resolver), so a week with no new takes still opens on the
 * whole conversation; after a change, an answer has no take until the owner
 * reads it again, and the older takes stay kept.
 *
 * The words: one to three exchanges, the first answer saying "paulgsc"
 * first, about two to three minutes across all the answers, and nothing
 * that rates or sets a finish line (`conversationProblems`).
 */
import type { Opening } from "@rust-rounds/lib/formats/week"

/** The standing set as it stands now. */
export const STANDING_OPENING: Opening = {
  version: 1,
  exchanges: [
    {
      ask: "What is Rust Rounds, in plain words?",
      script: [
        "paulgsc here.",
        "Rust Rounds is a small Rust program I work through every week.",
        "Each week starts with a company I make up and a story about it:",
        "a service that has to keep a promise, like answering within a time limit,",
        "and a few tickets that ask me to change it.",
        "I read each ticket on my phone, work the code at my desk,",
        "and then I say out loud what I would choose, and why.",
        "Some tickets fork: two reasonable ways to go,",
        "and I pick one and say what it costs.",
        "On Monday, Claude writes an essay from what I said",
        "and sets it beside the references,",
        "and this video is that essay.",
        "The companies are invented.",
        "The code is real, and so is everything I say about it.",
      ].join("\n"),
    },
    {
      ask: "Why do it every week?",
      script: [
        "Because the decisions I make at work rarely come",
        "with every trade-off spelled out.",
        "I want practice at that part:",
        "looking at a piece of Rust, seeing what it costs,",
        "picking a direction, and saying why in plain words.",
        "Doing it once teaches very little.",
        "Doing it every week, with a new company and new tickets,",
        "turns it into a habit.",
        "It also leaves a record.",
        "Every week's takes are kept,",
        "so months from now I can hear how I explained ownership",
        "or error handling the first time,",
        "and how I explain it then.",
        "There is no last round.",
        "Next week there will be another company, and I'll be back.",
      ].join("\n"),
    },
    {
      ask: "What should someone watching take from this?",
      script: [
        "Watch how a decision gets made, out loud, with the code on the screen.",
        "You'll hear me reason through it,",
        "sometimes slowly, sometimes wrong at first.",
        "The essay sets what I said next to what the references say,",
        "and shows which points my answer reached and which it didn't.",
        "If you write Rust, you might take away an idea,",
        "or a question to try for yourself.",
        "If you don't, you can still follow the thinking:",
        "what the program promises, what could break that promise,",
        "and what I would change.",
        "All of it is public:",
        "the code, the essays, and this conversation,",
        "which I record again whenever I want to say it better.",
      ].join("\n"),
    },
  ],
}

/** The opening a `/2` week carries: the standing set, copied as it stands. */
export const openingOfWeek = (): Opening => structuredClone(STANDING_OPENING)
