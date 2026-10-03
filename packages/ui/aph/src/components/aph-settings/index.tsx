/**
 * What aph is measured against: a goal per checkpoint, how close mine and
 * theirs must be to reconcile on their own, and the labels offered when
 * logging. A goal changed here applies from now on; past entries keep the
 * goal they were made under (`Entry.goal`), so their deltas do not move.
 */
import type { JSX } from "react"
import { useState } from "react"
import { CheckpointMark } from "@aph/components/status"
import type { AphSettings } from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { aphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { Button, Input } from "@some-ui/shared"
import { Plus, X } from "lucide-react"

type AphSettingsProps = { store?: AphStore }

/** A whole number from what was typed, ignoring "~" and separators. */
function wholeNumber(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "")
  return digits === "" ? null : Number(digits)
}

export const AphSettingsPanel = ({
  store = aphStore,
}: AphSettingsProps): JSX.Element => {
  const { settings } = useAph(store)
  const [newLabel, setNewLabel] = useState("")
  const edit = (patch: Partial<AphSettings>): void => store.editSettings(patch)

  const addLabel = (): void => {
    const label = newLabel.trim()
    if (label === "" || settings.labels.includes(label)) return
    edit({ labels: [...settings.labels, label] })
    setNewLabel("")
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <Section
        title="Goals"
        hint="A new goal applies from now on. Past entries keep the goal they were logged under."
      >
        {settings.checkpoints.map((c) => (
          <Row
            key={c.id}
            label={
              <>
                <CheckpointMark settings={settings} checkpoint={c.id} />
                {c.label}
              </>
            }
          >
            <NumberField
              label={`Goal at ${c.label}`}
              value={c.goal}
              onCommit={(goal) =>
                edit({
                  checkpoints: settings.checkpoints.map((k) =>
                    k.id === c.id ? { ...k, goal } : k
                  ),
                })
              }
            />
          </Row>
        ))}
      </Section>

      <Section
        title="Reconciling"
        hint="Mine and theirs this close settle by themselves. Further apart, they wait for your call."
      >
        <Row label="Match within ±">
          <NumberField
            label="Match tolerance"
            value={settings.tolerance}
            onCommit={(tolerance) => edit({ tolerance })}
          />
        </Row>
      </Section>

      <Section
        title="Labels"
        hint="Offered as chips when logging, so common cases are one tap."
      >
        <div className="flex flex-wrap gap-2">
          {settings.labels.map((label) => (
            <span
              key={label}
              className="bg-muted inline-flex h-9 items-center gap-1 rounded-full pl-3.5 pr-1 text-sm"
            >
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() =>
                  edit({ labels: settings.labels.filter((l) => l !== label) })
                }
                className="hover:bg-accent flex size-7 items-center justify-center rounded-full"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addLabel()
          }}
        >
          <Input
            aria-label="New label"
            placeholder="New label"
            value={newLabel}
            maxLength={24}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button type="submit" variant="outline" aria-label="Add label">
            <Plus aria-hidden className="size-4" />
          </Button>
        </form>
      </Section>

      <Section title="Entry">
        <Row label="− / + step">
          <NumberField
            label="Step"
            value={settings.step}
            onCommit={(step) => edit({ step })}
          />
        </Row>
        <Row label="Typo warning below">
          <NumberField
            label="Usual low"
            value={settings.usualLow}
            onCommit={(usualLow) => edit({ usualLow })}
          />
        </Row>
        <Row label="Typo warning above">
          <NumberField
            label="Usual high"
            value={settings.usualHigh}
            onCommit={(usualHigh) => edit({ usualHigh })}
          />
        </Row>
      </Section>
    </div>
  )
}

const Section = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: JSX.Element | Array<JSX.Element>
}): JSX.Element => (
  <section aria-label={title} className="flex flex-col gap-2">
    <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
      {title}
    </h2>
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-3">
      {children}
    </div>
    {hint !== undefined && (
      <p className="text-muted-foreground px-1 text-xs">{hint}</p>
    )}
  </section>
)

const Row = ({
  label,
  children,
}: {
  label: JSX.Element | string
  children: JSX.Element
}): JSX.Element => (
  <div className="flex items-center gap-3">
    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
      {label}
    </span>
    {children}
  </div>
)

/** Edits as text, commits a whole number on blur or Enter; anything else reverts. */
const NumberField = ({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}): JSX.Element => {
  const [text, setText] = useState<string | null>(null)
  const commit = (): void => {
    const next = text === null ? null : wholeNumber(text)
    if (next !== null && next !== value) onCommit(next)
    setText(null)
  }
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      className="w-24 text-right font-mono tabular-nums"
      value={text ?? value.toLocaleString("en-US")}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
      }}
    />
  )
}
