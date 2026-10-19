import { HomeNoAnswerError } from "@/lib/device-backend/native-http/no-answer"

/** What `native-http` throws when home gives no answer. */
export const noAnswer = (): HomeNoAnswerError =>
  new HomeNoAnswerError({
    kind: "unreachable",
    retryable: true,
    summary: "Couldn't reach the home server.",
    cause: null,
  })
