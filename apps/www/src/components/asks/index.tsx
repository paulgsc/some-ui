/**
 * The Asks page's parts (`routes/_dashboard/_lan/asks.tsx`): every open ask
 * (`lib/asks`), each by its kind. A decision shows why it's the owner's and
 * its options, each one a choice; a checklist shows its steps in order,
 * each with where it is done, what to do, a box for what to paste back and
 * Done. Every choice and step goes on the ask's receipt (`lib/asks/receipt`),
 * kept in this tab (`lib/asks/kept`), which one button copies. The read is
 * the query's (`openAsksQuery`); this draws its outcome and forwards taps.
 */
import type { JSX } from "react"
import { useId, useState, useSyncExternalStore } from "react"
import { Badge, Button, Label, Notice, Textarea } from "@some-ui/shared"
import type { AskStep, ChecklistAsk, DecisionAsk } from "@some-ui/video-render"
import { useQuery } from "@tanstack/react-query"

import type { OpenAsk } from "@/lib/asks"
import { openAsksQuery, questionOf } from "@/lib/asks"
import type { KeptReceipts } from "@/lib/asks/kept"
import type { Receipt } from "@/lib/asks/receipt"
import { lastChosen, receiptText, stepsDone } from "@/lib/asks/receipt"
import { ASKS_WORDS as W } from "@/lib/asks/words"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { CopyButton } from "@/components/copy-button"

const NO_RECEIPT: Receipt = []

const Part = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element => (
  <section className="flex flex-col gap-2">
    <h3 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
      {label}
    </h3>
    {children}
  </section>
)

/** A decision's options, each a choice; the last one chosen says so. */
const Options = ({
  ask,
  receipt,
  onChoose,
}: {
  ask: DecisionAsk
  receipt: Receipt
  onChoose: (option: number, note: string) => void
}): JSX.Element => {
  const [note, setNote] = useState("")
  const noteId = useId()
  const chosen = lastChosen(ask, receipt)
  return (
    <Part label={W.options}>
      <ol className="flex flex-col gap-2">
        {ask.options.map((option, place) => (
          <li
            key={option.says}
            className="flex items-start justify-between gap-4 rounded-lg border p-3"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                {option.says}
                {ask.recommended === place && (
                  <Badge variant="secondary" className="ml-2">
                    {W.recommended}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground text-sm">
                {W.unblocks(option.unblocks)}
              </span>
            </div>
            {chosen === place ? (
              <span className="text-sm font-medium">{W.chosen}</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onChoose(place, note)
                  setNote("")
                }}
              >
                {W.choose}
              </Button>
            )}
          </li>
        ))}
      </ol>
      <Label htmlFor={noteId}>{W.note}</Label>
      <Textarea
        id={noteId}
        value={note}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
      />
    </Part>
  )
}

/** One step: where, what to do, what to paste back, and Done. */
const Step = ({
  step,
  place,
  of,
  done,
  onDone,
}: {
  step: AskStep
  place: number
  of: number
  done: boolean
  onDone: (pasted: string) => void
}): JSX.Element => {
  const [pasted, setPasted] = useState("")
  const id = useId()
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">
          <span className="text-muted-foreground mr-2 text-sm">
            {W.step(place, of)}
          </span>
          {step.says}
        </span>
        {done && <Badge variant="secondary">{W.isDone}</Badge>}
      </div>
      {step.where !== undefined && (
        <p className="text-muted-foreground text-sm">{W.where(step.where)}</p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {step.do.map((line, at) => (
          // A step's lines are fixed while it shows, and may repeat.
          // eslint-disable-next-line react/no-array-index-key
          <li key={at}>{line}</li>
        ))}
      </ol>
      {step.paste !== undefined && (
        <>
          <Label htmlFor={id}>
            {step.paste} · {W.paste}
          </Label>
          <Textarea
            id={id}
            value={pasted}
            rows={3}
            className="font-mono text-xs"
            onChange={(event) => setPasted(event.target.value)}
          />
        </>
      )}
      <Button
        size="sm"
        className="self-start"
        variant={done ? "outline" : "default"}
        onClick={() => {
          onDone(pasted)
          setPasted("")
        }}
      >
        {done ? W.doneAgain : W.done}
      </Button>
    </li>
  )
}

const Steps = ({
  ask,
  receipt,
  onDone,
}: {
  ask: ChecklistAsk
  receipt: Receipt
  onDone: (step: number, pasted: string) => void
}): JSX.Element => {
  const done = stepsDone(ask, receipt)
  return (
    <Part label={W.stepsDone(done.size, ask.steps.length)}>
      <ol className="flex flex-col gap-2">
        {ask.steps.map((step, place) => (
          <Step
            key={step.says}
            step={step}
            place={place}
            of={ask.steps.length}
            done={done.has(place)}
            onDone={(pasted) => onDone(place, pasted)}
          />
        ))}
      </ol>
      <p className="text-muted-foreground text-sm">
        {W.whenDone(ask.unblocks)}
      </p>
    </Part>
  )
}

/** One ask: what it asks, why it's the owner's, its kind's parts, its receipt. */
const AskCard = ({
  open,
  kept,
}: {
  open: OpenAsk
  kept: KeptReceipts
}): JSX.Element => {
  const receipts = useSyncExternalStore(kept.subscribe, kept.getSnapshot)
  const receipt = receipts.get(open.id) ?? NO_RECEIPT
  const { ask } = open
  return (
    <article className="flex flex-col gap-3 rounded-xl border p-4">
      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">
          {ask === null
            ? W.from[open.repo]
            : `${W.kind[ask.kind]} · ${W.from[open.repo]}`}
        </span>
        <h2 className="text-lg font-semibold">{questionOf(open)}</h2>
        <a
          href={open.url}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground self-start text-sm underline underline-offset-4"
        >
          {W.open}
        </a>
      </header>
      {ask === null ? (
        <p className="text-muted-foreground text-sm">{W.unread}</p>
      ) : (
        <>
          <Part label={W.whyYours}>
            <p className="text-sm">{ask.whyYours}</p>
          </Part>
          {ask.kind === "decision" ? (
            <Options
              ask={ask}
              receipt={receipt}
              onChoose={(option, note) =>
                kept.append(open.id, ask, {
                  kind: "chose",
                  option,
                  note,
                  at: new Date(),
                })
              }
            />
          ) : (
            <Steps
              ask={ask}
              receipt={receipt}
              onDone={(step, pasted) =>
                kept.append(open.id, ask, {
                  kind: "step",
                  step,
                  pasted,
                  at: new Date(),
                })
              }
            />
          )}
          {receipt.length > 0 && (
            <Part label={W.receipt}>
              <p className="text-sm">{W.receiptHolds(receipt.length)}</p>
              <CopyButton
                text={receiptText({ ...open, ask }, receipt)}
                what={W.copyWhat}
              />
            </Part>
          )}
        </>
      )}
    </article>
  )
}

/** Every open ask, or what stands in for them until they're read. */
export const AsksPage = ({ kept }: { kept: KeptReceipts }): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(openAsksQuery)), {
    pending: () => <p className="text-muted-foreground text-sm">{W.reading}</p>,
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{W.away}</p>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={retry}
        >
          {W.tryAgain}
        </Button>
      </div>
    ),
    ready: (asks, refreshError) => (
      <>
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{ label: W.tryAgain, onClick: refreshError.retry }}
          >
            {W.stale}
          </Notice>
        )}
        {asks.length === 0 ? (
          <p className="text-muted-foreground text-sm">{W.none}</p>
        ) : (
          asks.map((open) => <AskCard key={open.id} open={open} kept={kept} />)
        )}
      </>
    ),
  })
