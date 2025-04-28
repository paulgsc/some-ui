import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Hexagon wasm",
      progress: "pending",
      content: `I've wanted to build a honeycomb/hexagon ui chart for a while. At first I thought this meant grocery shopping.
          Meaning, pip/npm install some deps. But me not enjoy this very much, so pushed it off for a while now.
          But with vibe coding now, I'm able to build my own hexagon svg ui. The core logic is in rust, and 
        today I'm consuming the wasm and setting up the usehooks and component ui.
        `,
    },
    {
      stepId: "item-2",
      title: "NFL 53 man roster chart",
      progress: "pending",
      content: `As part of my collection of overlays that tell data stories about the nfl. I'm building a chart the renders
      a team's 53-man roster in a hexagon/honeycomb chart. Why a hexagon, why not? Most likely won't finish today,
      and for now focusing on the ui not the data.`,
    },
    {
      stepId: "item-3",
      title: "Some emoji animation",
      progress: "pending",
      content: `For my no talk talk coding livestreams, I've always wanted to visually communicate my current emotional
      state. Ideally, I would do this with an animated 3-d character from a blender export, that I can animate in different
      actions, emotions etc. But sadly me not know blender, me not know threejs me not have drawing skills. Instead I've
      settled for the wish.com version of using an emoji, but I kinda hate it. Today me look to see if I can give it more
        expressions.`,
    },
    {
      stepId: "item-4",
      title: "Foo scheduler thingy",
      progress: "scheduled",
      content: `I have the scaffold for an async background scheduler, that I'm not quite sure what to use it for. I believe
        I want to be able to automatically scheduled pre-produced react overlays, so that as part of my livestream, I can
      basically run the stream like a T.V production, where on a pre-planned scheduled certain overlays are triggered
      to run for a defined period, in a sequence. The scheduler will be the one running this. Problem is I haven't touched it for 
        so long I forgot how it's working.`,
    },
    {
      stepId: "item-5",
      title: "NixOS pnpm upgrade to v10",
      progress: "pending",
      content: `Migrate my flakes home pnpm package to v10, and hopefully everything is still working`,
    },
  ],
}
