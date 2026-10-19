import { ForeignCallError } from "@/lib/intent/foreign"

/** What `native-http` throws when home gives no answer. */
export const noAnswer = (): ForeignCallError =>
  new ForeignCallError({
    kind: "unreachable",
    retryable: true,
    summary: "Couldn't reach the home server.",
    cause: null,
  })
