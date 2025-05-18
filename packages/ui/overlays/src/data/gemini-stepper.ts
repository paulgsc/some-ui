import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Praying to the Vibe Gods",
      progress: "pending",
      content: `I want to do a thing, kinda complicated so don't even know what it is. So, I'll be paying tributes to the vibe gods,
    hoping they can bless me with great providence.`,
    },
    {
      stepId: "item-2",
      title: "Hexagon Math",
      progress: "pending",
      content: `Learn some hexagon math, and by learn I mean hallucinate some prompts for claude to do a thing.`,
    },
    {
      stepId: "item-3",
      title: "Research Sound Effects",
      progress: "pending",
      content: `Can it be possible for me to create own sound effects?`,
    },
    {
      stepId: "item-4",
      title: "This vidya has some tock tock",
      progress: "pending",
      content: `In a depature from type, we do talk in this stream, mostly because for once I'm working
      on something that I have zero clue how to do. No idea on what really as well.
      `,
    },
  ],
}
