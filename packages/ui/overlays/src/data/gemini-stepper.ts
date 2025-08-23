import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Dockerfile",
      progress: "done",
      content: `How many errors, until we have a working server docker instance?`,
    },
    {
      stepId: "item-4",
      title: "Watching drama",
      progress: "pending",
      content: `I'm going to be watchig a drama, while doing all this, so there will be weird pauses, as well.`,
    },
  ],
}
