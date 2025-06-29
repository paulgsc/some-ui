import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Github API Handler",
      progress: "pending",
      content: `This is an axum server handler. And I want to be able to ping github so I can get metadata on my repositories
      and packages. The purpose for this is so that I can keep track of graveyard projects. In essence, I want to see the last
        time I worked on a specific repo/package. And what packages are becoming dead packages.`,
    },
    {
      stepId: "item-2",
      title: "Grafana Docker Setup",
      progress: "pending",
      content: `So, I want to instrument my server, so that I can have telemetry and insights on my server. And a milestone towards
      this end is having a working prometheus/grafana dashboard setup. Today, the goal is to get grafana/prometheus picking up the 
      instrumentations from my handler requests.`,
    },
    {
      stepId: "item-3",
      title: "Graveyard Projects UI",
      progress: "pending",
      content: `Suppose I work on many repos, and many packages. Supose many are dead. Suppose me sad about this.`,
    },
    {
      stepId: "item-4",
      title: "Watching drama",
      progress: "pending",
      content: `I'm going to be watchig a drama, while doing all this, so there will be weird pauses, as well.`,
    },
  ],
}
