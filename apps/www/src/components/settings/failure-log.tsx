/**
 * "What went wrong lately", under the status board: the phone's own record
 * of every failure it reported (`lib/failure-log`), newest first, with a
 * copy of the whole of it to paste where it can be looked into. Each line is
 * the app's own note, as the native log has it; the words around it are the
 * page's (`lib/status-board/words`).
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"

import {
  FAILURE_LOG_CAP,
  failureLogSnapshot,
  subscribeFailureLog,
} from "@/lib/failure-log"
import { BOARD_WORDS } from "@/lib/status-board/words"
import { CopyButton } from "@/components/jobs/parts"

export const FailureLog = (): JSX.Element => {
  const newest = useSyncExternalStore(subscribeFailureLog, failureLogSnapshot)
  return (
    <section aria-label={BOARD_WORDS.failures} className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {BOARD_WORDS.failures}
        </h2>
        {newest.length > 0 ? (
          <CopyButton
            text={newest.map((entry) => `${entry.at} ${entry.line}`).join("\n")}
            what={BOARD_WORDS.failuresWhat}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground px-1 text-sm">
        {BOARD_WORDS.failuresLead(String(FAILURE_LOG_CAP))}
      </p>
      {newest.length === 0 ? (
        <p className="rounded-xl border p-3 text-sm">
          {BOARD_WORDS.failuresNone}
        </p>
      ) : (
        <ol
          data-scroll-intent=""
          className={
            // scroll-intent: up to FAILURE_LOG_CAP lines, read by scrolling back through
            // them; the page around the log stays where it is.
            "max-h-96 space-y-3 overflow-y-auto rounded-xl border p-3"
          }
        >
          {newest.map((entry) => (
            <li key={`${entry.at} ${entry.line}`} className="space-y-0.5">
              <time
                dateTime={entry.at}
                className="text-muted-foreground block text-xs"
              >
                {new Date(entry.at).toLocaleString()}
              </time>
              <p className="font-mono text-xs break-words">{entry.line}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
