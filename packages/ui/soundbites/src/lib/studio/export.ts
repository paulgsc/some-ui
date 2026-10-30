/**
 * A Studio project as files for Claude: `project.json` (the project file,
 * from which any session resumes), `takes.json` (the scenes in order, each
 * with its chosen take's file, the shape the Build Journal's splicer reads),
 * and the audio of every take still on the phone, each named as the cut list
 * names it (`takeFile`).
 */
import { projectFile } from "@soundbites/lib/project/file"
import type { Project } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import { chosenTake, scriptOf, takeFile } from "@soundbites/lib/project/script"
import type { ProjectStore } from "@soundbites/lib/project/store"

type StudioFile = {
  readonly name: string
  readonly data: string | Blob
}

/** `takes.json`'s text: the latest revision's scenes, in order. */
function takesManifest(
  project: Project,
  exportedAt: string,
  timeZone: string
): string {
  const { primer, scenes } = scriptOf(project)
  return JSON.stringify(
    {
      kind: "build-journal-takes",
      version: 1,
      about:
        "Voice takes for one Build Journal video, recorded on the phone in Studio. Cuts play in this order; each chosen take's audio is the file named in `take.file` (sent with this share, or with an earlier one), and a cut with `take: null` was not recorded. project.json holds every revision, note, take and sitting.",
      title: latest(project).cutList.title,
      project: project.id,
      rev: latest(project).rev,
      exportedAt,
      timeZone,
      budgetMs: primer?.budgetMs ?? null,
      voice: latest(project).cutList.voice,
      cuts: scenes.map(({ shot, cut }) => {
        const take = chosenTake(project, shot.id)
        return {
          id: shot.id,
          artifact: cut?.artifact ?? null,
          prompt: cut?.prompt ?? null,
          point: cut?.point ?? null,
          line: cut?.line ?? null,
          keep: cut?.keep ?? [],
          voice: cut?.voice ?? null,
          targetMs: shot.durationMs,
          take:
            take === null
              ? null
              : {
                  file: takeFile(take),
                  recordedAt: take.recordedAt,
                  durationMs: take.durationMs,
                  mimeType: take.mimeType,
                },
        }
      }),
    },
    null,
    2
  )
}

/**
 * The project as files, and the takes they carry (for "they arrived"). A
 * take whose audio is no longer on the phone is listed, not sent.
 */
export async function studioFiles(
  store: Pick<ProjectStore, "audio">,
  project: Project,
  exportedAt: string,
  timeZone: string
): Promise<{
  files: Array<StudioFile>
  sent: Array<string>
}> {
  const audio = await Promise.all(
    project.takes
      .filter((take) => take.onPhone)
      .map(async (take) => ({
        take,
        blob: await store.audio(project.id, take.id),
      }))
  )
  const sending = audio.filter(
    (each): each is { take: (typeof each)["take"]; blob: Blob } =>
      each.blob !== null
  )
  return {
    files: [
      { name: "project.json", data: projectFile(project) },
      {
        name: "takes.json",
        data: takesManifest(project, exportedAt, timeZone),
      },
      ...sending.map((each) => ({
        name: takeFile(each.take),
        data: each.blob,
      })),
    ],
    sent: sending.map((each) => each.take.id),
  }
}
