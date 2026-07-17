import type { AccordionSteps } from "@some-ui/stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Blocking Issues",
      progress: "pending",
      content: `Give a snapshot summary of current blocking issues.`,
    },
    {
      stepId: "item-2",
      title: "WS SLA",
      progress: "pending",
      content: `Start work on implementing the next sla for websocket service.`,
    },
    {
      stepId: "item-4",
      title: "Watching drama",
      progress: "pending",
      content: `watch fated hearts or love in the clouds... `,
    },
    {
      stepId: "item-3",
      title: "Orchestration",
      progress: "pending",
      content: `Continue work on building my livestream script orchestration service.`,
    },
    {
      stepId: "item-5",
      title: "K8 Orchestration",
      progress: "pending",
      content: `Switch from docker compose god object, that invokes all services and
      to a delcarative, orchestration of services`,
    },
    {
      stepId: "item-6",
      title: "file-host ws",
      progress: "done",
      content: `upgrading to new file host ws multi layer design, add uptime monitoring`,
    },
    {
      stepId: "item-7",
      title: "pappaya",
      progress: "pending",
      content: `Travails through pappaya. We do "deep dive"`,
    },
  ],
}
