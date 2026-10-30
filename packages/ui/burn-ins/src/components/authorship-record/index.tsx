import type { JSX } from "react"
import { BurnInStage } from "@burn-ins/components/stage"
import { recordParams, scenesOf } from "@burn-ins/lib/authorship-link"
import { frameAt, prepare, type Prepared } from "@burn-ins/lib/burn-in"
import { INK } from "@burn-ins/lib/journal"
import { WORDS } from "@burn-ins/lib/words"

/** The mark for a record. Its params come from `recordParams`, checked in tests. */
const markOf = (code: string | undefined): Prepared | null => {
  const scenes = code === undefined ? null : scenesOf(code)
  if (scenes === null || scenes.length === 0) return null
  const p = prepare({
    kind: "authorship",
    design: "cells-v1",
    params: recordParams(scenes),
  })
  return p.ok ? p.value : null
}

const SAMPLE = markOf("A")

/**
 * The page an authorship mark's end card names (STUDIO ST16): what the mark
 * means, drawn by the mark's own intro, and the record of the video whose
 * end card linked here, read from `code` alone. Nothing is kept or fetched.
 */
export const AuthorshipRecord = ({ code }: { code?: string }): JSX.Element => {
  const mark = markOf(code)
  const words = WORDS.record
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-2">
        <header className="flex flex-col gap-3 md:col-span-2">
          <h1 className="text-2xl font-semibold">{words.title}</h1>
          {words.intro.map((line) => (
            <p key={line} className="text-muted-foreground max-w-prose">
              {line}
            </p>
          ))}
        </header>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{words.keyHeading}</h2>
          {SAMPLE && (
            <BurnInStage
              frames={[frameAt(SAMPLE, 0)]}
              ground={INK.ground}
              label={words.keyLabel}
            />
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{words.recordHeading}</h2>
          {mark ? (
            <BurnInStage
              frames={[frameAt(mark, Number.MAX_SAFE_INTEGER)]}
              ground={INK.ground}
              label={words.recordLabel}
            />
          ) : (
            <p className="text-muted-foreground">{words.noRecord}</p>
          )}
        </section>
      </div>
    </div>
  )
}
