import type { FC } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { HomeSessionFiles } from "@leetype/lib/leetype/home-files"
import {
  HomeFilesRuntime,
  threadsOf,
  HOME_FILES_WORDS as WORDS,
} from "@leetype/lib/leetype/home-files"
import type {
  HeldSessionFile,
  SessionFileStore,
} from "@leetype/lib/leetype/session-file-pick"
import { Button, Notice } from "@some-ui/shared"
import { CloudDownload } from "lucide-react"

type HomeFilesProps = {
  /** Fixed for the list's life: the host keys this on `home.key`. */
  home: HomeSessionFiles
  store: SessionFileStore
  /** What the phone holds now, to mark what is on it already. */
  held: ReadonlyArray<HeldSessionFile>
  /** A keep put a file on the phone: the held list reads again. */
  onKept: () => void
}

/**
 * "From home": the session files the paired home holds, by thread, the
 * current one first, each thread kept on the phone at a tap so it plays
 * offline (`@leetype/lib/leetype/home-files`). What a keep did is a
 * `Notice` over the list; the list itself changes only with what home
 * holds and what the phone holds.
 */
export const HomeFiles: FC<HomeFilesProps> = ({
  home,
  store,
  held,
  onKept,
}) => {
  // Made once per mount: the host remounts this for a new pairing.
  const [runtime] = useState(() => new HomeFilesRuntime(home, store, onKept))
  const { look, keep } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => {
    runtime.start()
    return runtime.cancel
  }, [runtime])

  if (look.kind === "looking") return null
  const threads = threadsOf(look.files, held)
  const keeping = keep.kind === "keeping"

  return (
    <section aria-label={WORDS.heading} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{WORDS.heading}</h3>
      {threads.length === 0 && look.ended === null && (
        <p className="text-pretty text-xs text-muted-foreground">
          {WORDS.none}
        </p>
      )}
      {threads.map((group) => (
        <div
          key={group.thread ?? "other"}
          role="group"
          aria-label={WORDS.thread(group.thread)}
          className="flex flex-col gap-1"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {WORDS.thread(group.thread)}
            {group.current ? ` · ${WORDS.current}` : ""}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.files.map((file) => (
              <li key={file.name} className="text-pretty text-xs">
                <span className="font-medium">{file.title}</span>
                {file.onPhone ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {WORDS.onPhone}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {group.missing === 0 ? (
            <p className="text-xs text-muted-foreground">{WORDS.allOnPhone}</p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={keeping}
              onClick={(): void =>
                runtime.keepThread(
                  group.thread,
                  group.files
                    .filter((file) => !file.onPhone)
                    .map((file) => file.name)
                )
              }
            >
              <CloudDownload aria-hidden />
              {WORDS.keep(group.missing, group.files.length)}
            </Button>
          )}
        </div>
      ))}
      {look.ended !== null && (
        <Notice key={look.ended} tone="neutral" dismissible>
          <p className="text-pretty">{WORDS.ended[look.ended]}</p>
        </Notice>
      )}
      {keep.kind === "keeping" && (
        <Notice tone="neutral">
          <p className="text-pretty">{WORDS.keeping(keep.done, keep.of)}</p>
        </Notice>
      )}
      {keep.kind === "said" && (
        <Notice key={keep.words} tone="neutral" dismissible>
          <p className="text-pretty">{keep.words}</p>
        </Notice>
      )}
    </section>
  )
}
