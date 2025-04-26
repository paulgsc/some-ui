import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Livestream Overlay Stepper UI",
      progress: "done",
      content: `
      Setup a first pass working stepper ui card. This stepper takes inspiration from the geminii research
      component card. I want to have some viz that communicates what I'm doing in my livestream passively
      without having me talk talk and I've settle on some stepper accordion animation which I'll have some
      minamal version working.
      `,
    },
    {
      stepId: "item-2",
      title: "Livestream Overlay Neon Sign",
      progress: "done",
      content: `Neon sign that not sure what I want to do with has issue of text not being space separated.
      Need to fix.`,
    },
    {
      stepId: "item-3",
      title: "Livestream Overlay Stepper UI",
      progress: "done",
      content: `Add a progress state, so that svg icon either shows done or to do icon based on state.
        This should be rather trivial, add state key to data schema.`,
    },
    {
      stepId: "item-3",
      progress: "scheduled",
      title: "some title",
      content: "some content",
    },
    {
      stepId: "item-3",
      title: "some title",
      progress: "scheduled",
      content: "some content",
    },
  ],
}
