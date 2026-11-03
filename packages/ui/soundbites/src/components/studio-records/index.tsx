/**
 * What Studio keeps (MY-DATA MD4, #2478): every take of every video, each
 * on the take pattern's row: Play while its audio is on this phone, where
 * it is kept and since when, and Delete… on a take home marks deletable,
 * which opens My data on it (`openInMyData`) and never deletes here.
 * Renders `lib/studio/records.ts`'s state; its words are Studio's
 * (`records`).
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { TakeRow } from "@some-ui/shared"
import type { RecordsPorts } from "@soundbites/lib/studio/records"
import {
  createStudioRecords,
  recordsView,
} from "@soundbites/lib/studio/records"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

const WORDS = STUDIO_WORDS.records

export type StudioRecordsProps = {
  /** The projects, what home marks deletable, and a player. Read once. */
  ports: RecordsPorts
  /** Opens My data on take `id` (MD3's sheet takes over there). */
  openInMyData: (id: string) => void
}

export const StudioRecords = ({
  ports,
  openInMyData,
}: StudioRecordsProps): JSX.Element => {
  /* eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are */
  const [records] = useState(() => createStudioRecords(ports))
  useEffect(() => records.attach(), [records])
  const state = useSyncExternalStore(records.subscribe, records.getSnapshot)
  if (state.projects === null) {
    return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
  }
  if (state.projects === "unreadable") {
    return <p className="text-sm">{WORDS.unreadable}</p>
  }
  const projects = recordsView(state.projects, state.deletable, state.playing)
  if (projects.length === 0) {
    return <p className="text-muted-foreground text-sm">{WORDS.none}</p>
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{WORDS.deleteLine}</p>
      {projects.map((project) => (
        <section key={project.project} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">{project.title}</h2>
          <ul className="flex flex-col gap-2">
            {project.rows.map((row) => (
              <TakeRow
                key={row.take.id}
                row={row}
                onPlay={() => records.play(project.project, row.take.id)}
                onDelete={() => openInMyData(row.take.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
