import type { JSX } from "react"
import { BurnInStage } from "@burn-ins/components/stage"
import { MOST_SCENES } from "@burn-ins/lib/authorship"
import type { SceneRecord } from "@burn-ins/lib/authorship-link"
import { recordParams, scenesOf } from "@burn-ins/lib/authorship-link"
import { frameAt, prepare, type Prepared } from "@burn-ins/lib/burn-in"
import { INK } from "@burn-ins/lib/journal"
import { SAMPLES } from "@burn-ins/lib/samples"
import { sceneLine, WORDS } from "@burn-ins/lib/words"

/** What a link's code draws: the video's mark and scenes, or why there are none. */
type Read =
  | {
      readonly kind: "mark"
      readonly mark: Prepared
      readonly scenes: ReadonlyArray<SceneRecord>
    }
  | { readonly kind: "none" | "too-long" }

/** The mark for a record. Its params come from `recordParams`, checked in tests. */
function read(code: string | undefined): Read {
  const scenes = code === undefined ? null : scenesOf(code)
  if (scenes === null || scenes.length === 0) return { kind: "none" }
  if (scenes.length > MOST_SCENES) return { kind: "too-long" }
  const p = prepare({
    kind: "authorship",
    design: "cells-v1",
    params: recordParams(scenes),
  })
  return p.ok ? { kind: "mark", mark: p.value, scenes } : { kind: "none" }
}

/** The key every video opens with: the mark's intro, at its start. */
const KEY = prepare({
  kind: "authorship",
  design: "cells-v1",
  params: SAMPLES.authorship,
})

/**
 * The page an authorship mark's end card names (STUDIO ST16): what the mark
 * means, drawn by the mark's own intro, and the record of the video whose
 * end card linked here, read from `code` alone. Nothing is kept or fetched.
 */
export const AuthorshipRecord = ({ code }: { code?: string }): JSX.Element => {
  const record = read(code)
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
          {KEY.ok && (
            <BurnInStage
              frames={[frameAt(KEY.value, 0)]}
              ground={INK.ground}
              label={words.keyLabel}
            />
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{words.recordHeading}</h2>
          {record.kind === "mark" ? (
            <>
              <BurnInStage
                frames={[frameAt(record.mark, Number.MAX_SAFE_INTEGER)]}
                ground={INK.ground}
                label={words.recordLabel}
              />
              <h3 className="text-base font-medium">{words.listHeading}</h3>
              <ol className="text-muted-foreground flex flex-col gap-1 text-sm">
                {record.scenes.map((scene, i) => (
                  // The record is fixed by the link: its order is its identity.
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}>{sceneLine(i + 1, scene)}</li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-muted-foreground">
              {record.kind === "too-long" ? words.tooLong : words.noRecord}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
