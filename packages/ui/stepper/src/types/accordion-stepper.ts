export type AccordionSteps = {
  meta: {
    title: string
  }
  data: Array<Record<"stepId" | "title" | "content", string> & StepStatus>
}

export type StepStatus = Record<"progress", "pending" | "done" | "scheduled">
