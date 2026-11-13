/**
 * My data's Korean word sets page (MY-DATA MD7, #2496): each word set this
 * phone keeps for Read aloud, in use and then archived, with when it was
 * added and first opened and how many sentences it reads. Archive takes a
 * set out of Read aloud and Ready for you and keeps it whole; Bring back
 * puts it back. Only the owner archives (C232): a set first opened a month
 * or more ago carries a hint, nothing more. What was done is said in a
 * `Notice` over the screen (HS1), and the page holds no touch code (GES5).
 * The store is `lib/my-data`'s `phoneWordSetsPage`; every word is
 * `WORD_SETS`. Phone build only.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import type { WordSetRow } from "@some-ui/topik"

import type { WordSetsPage, WordSetsSaid } from "@/lib/my-data"
import { phoneWordSetsPage } from "@/lib/my-data"
import { WORD_SETS } from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { MyDataHeading } from "@/components/settings/device-my-data"

const WORDS = WORD_SETS

const SetRow = ({
  row,
  page,
  canBringBack,
}: {
  row: WordSetRow
  page: WordSetsPage
  canBringBack: boolean
}): JSX.Element => {
  const archived = row.archivedAt !== null
  return (
    <li className="flex flex-col gap-1 p-3">
      <span className="text-sm font-medium break-words">{row.title}</span>
      <span className="text-muted-foreground text-xs">
        {[
          WORDS.added(row.addedAt),
          WORDS.opened(row.openedAt),
          WORDS.sentences(row.lines),
          ...(row.archivedAt === null
            ? []
            : [WORDS.archivedOn(row.archivedAt)]),
        ].join(" · ")}
      </span>
      {!archived && row.openedLongAgo ? (
        <span className="text-muted-foreground text-xs">{WORDS.longAgo}</span>
      ) : null}
      {archived ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          disabled={!canBringBack}
          aria-label={WORDS.bringBackName(row.title)}
          onClick={() => page.bringBack(row.id)}
        >
          {WORDS.bringBack}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          aria-label={WORDS.archiveName(row.title)}
          onClick={() => page.archive(row.id)}
        >
          {WORDS.archive}
        </Button>
      )}
    </li>
  )
}

/** What was just done, said over the screen. */
const Said = ({
  said,
  page,
}: {
  said: WordSetsSaid
  page: WordSetsPage
}): JSX.Element => {
  switch (said.kind) {
    case "archived": {
      return (
        <Notice
          onDismiss={page.dismiss}
          action={{
            label: WORDS.undo,
            onClick: () => page.bringBack(said.id),
          }}
        >
          {WORDS.said.archived(said.title)}
        </Notice>
      )
    }
    case "broughtBack": {
      return (
        <Notice onDismiss={page.dismiss}>
          {WORDS.said.broughtBack(said.title)}
        </Notice>
      )
    }
    case "notKept": {
      return (
        <Notice tone="danger" onDismiss={page.dismiss}>
          {WORDS.said.notKept}
        </Notice>
      )
    }
    case "noRoom": {
      return (
        <Notice tone="warning" onDismiss={page.dismiss}>
          {WORDS.said.noRoom(said.limit)}
        </Notice>
      )
    }
    default: {
      return assertNever(said)
    }
  }
}

/** My data's Korean word sets page, read on mount and on a drag down. */
export const DeviceMyDataWordSets = (): JSX.Element => {
  const page = phoneWordSetsPage()
  const state = useSyncExternalStore(page.subscribe, page.getSnapshot)
  useEffect(() => {
    page.open()
    return screenRefreshers.register({
      what: WORDS.pullWhat,
      checkAgain: page.checkAgain,
    })
  }, [page])
  return (
    <>
      <MyDataHeading title={WORDS.title} />
      <p className="text-muted-foreground text-sm">{WORDS.lead}</p>
      {state.kind === "reading" ? (
        <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
      ) : null}
      {state.kind === "unread" ? (
        <p className="text-muted-foreground text-sm">{WORDS.unread}</p>
      ) : null}
      {state.kind === "read" ? (
        <>
          {state.list.inUse.length === 0 && state.list.archived.length === 0 ? (
            <p className="text-muted-foreground text-sm">{WORDS.none}</p>
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">
                {WORDS.inUse(state.list.inUse.length, state.list.limit)}
              </h2>
              {state.list.inUse.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {WORDS.noneInUse}
                </p>
              ) : (
                <ul className="bg-card divide-y rounded-xl border">
                  {state.list.inUse.map((row) => (
                    <SetRow
                      key={row.id}
                      row={row}
                      page={page}
                      canBringBack={state.list.room}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
          {state.list.archived.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">{WORDS.archivedTitle}</h2>
              {state.list.room ? null : (
                <p className="text-muted-foreground text-xs">
                  {WORDS.full(state.list.limit)}
                </p>
              )}
              <ul className="bg-card divide-y rounded-xl border">
                {state.list.archived.map((row) => (
                  <SetRow
                    key={row.id}
                    row={row}
                    page={page}
                    canBringBack={state.list.room}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {state.said === null ? null : (
            <Said key={state.saidCount} said={state.said} page={page} />
          )}
        </>
      ) : null}
    </>
  )
}
