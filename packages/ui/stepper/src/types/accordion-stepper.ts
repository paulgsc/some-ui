export type AccordionSteps = {
  meta: {
    title: string
  }
  data: Array<Record<"stepId" | "title" | "content", string>>
}
