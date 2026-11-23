/**
 * A list read from elsewhere, once read, or what stands in for it: the
 * pending line, the failure with Try again, and, when a refresh fails, what
 * was read before under a notice that says so. Its words are the caller's.
 */
import type { JSX, ReactNode } from "react"
import { Button, Notice } from "@some-ui/shared"
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"

import { phoneWasBusy } from "@/lib/phone-busy"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"

/** What a list read from elsewhere says while it reads, can't, or can't again. */
export type ReadWords = {
  readonly reading: string
  readonly away: string
  readonly stale: string
  readonly tryAgain: string
  /** What it says when this phone stayed busy with home (#3155), if it can be. */
  readonly busy?: string
  readonly busyStale?: string
}

/**
 * A list read from elsewhere (Asks, Studio's Clips and Renders), once read, or what stands in for
 * it until then. A refresh that failed keeps what was read before, and says so.
 */
export function ReadList<T, K extends QueryKey>({
  query,
  words,
  narrowRetry = false,
  children,
}: {
  query: UseQueryOptions<T, Error, T, K>
  words: ReadWords
  /** Try again as wide as its words, not the column (the desktop web's). */
  narrowRetry?: boolean
  children: (value: T) => ReactNode
}): JSX.Element {
  return matchQueryOutcome(queryOutcome(useQuery(query)), {
    pending: () => (
      <p className="text-muted-foreground text-sm">{words.reading}</p>
    ),
    failed: (error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          {(phoneWasBusy(error) ? words.busy : undefined) ?? words.away}
        </p>
        <Button
          size="sm"
          variant="outline"
          className={narrowRetry ? "self-start" : undefined}
          onClick={retry}
        >
          {words.tryAgain}
        </Button>
      </div>
    ),
    ready: (value, refreshError) => (
      <>
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{
              label: words.tryAgain,
              onClick: refreshError.retry,
            }}
          >
            {(phoneWasBusy(refreshError.error) ? words.busyStale : undefined) ??
              words.stale}
          </Notice>
        )}
        {children(value)}
      </>
    ),
  })
}
