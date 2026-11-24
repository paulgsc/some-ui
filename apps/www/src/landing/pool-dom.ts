/**
 * Each pool's draw put on the page (#3473, C1440): run by the landing's one
 * script (`enhance.ts`) before anything else there reads the show. The
 * snacks come from the pool's inert template (`render.ts`, `pool`); each
 * drawn snack takes a place of the first draw the page was built with, on
 * the stage (its copy and both cubes), in the list, and, at the first
 * place, in the skeletons. Every face it puts is the snack's own, whole:
 * nothing of the built draw is left in a place it fills.
 */
import { drawSnacks } from "./draw.ts"

/** A face's place takes a snack's face: its asset, its label, and its picture. */
function putFace(
  place: HTMLElement | null | undefined,
  face: HTMLElement,
  label: string
): void {
  if (place == null) return
  const screen = place.querySelector(".screen")
  if (screen === null) return
  for (const name of ["slot", "asset"])
    place.dataset[name] = face.dataset[name] ?? ""
  screen.replaceChildren(...[...face.childNodes].map((n) => n.cloneNode(true)))
  const band = place.querySelector(label)
  if (band !== null) band.textContent = face.dataset["label"] ?? ""
}

/** Each of a place's lines takes the snack's line at its place. */
function putLines(
  old: ReadonlyArray<Element>,
  texts: ReadonlyArray<string>
): void {
  old.forEach((line, l) => {
    line.textContent = texts[l] ?? ""
  })
}

export function drawPools(seed: number): void {
  for (const template of document.querySelectorAll<HTMLTemplateElement>(
    "template.pool"
  )) {
    const episode = template.dataset["episode"] ?? ""
    const snacks = [...template.content.querySelectorAll<HTMLElement>(".snack")]
    const drawn = drawSnacks(
      episode,
      snacks.length,
      Number(template.dataset["draw"]),
      seed
    )
    const copy = document.querySelector(`.copy[data-copy="${episode}"]`)
    const places = [...(copy?.querySelectorAll(".scene") ?? [])]
    const cubes = [
      ...document.querySelectorAll(
        `.pair[data-episode="${episode}"] .ring-turn`
      ),
    ].map((turn) => [...turn.children].filter((c) => c.matches(".face")))
    const flat = [
      ...document.querySelectorAll<HTMLElement>(
        `.episode[data-episode="${episode}"] .scene-flat`
      ),
    ]
    drawn.forEach((at, place) => {
      const snack = snacks.at(at)
      if (snack === undefined) return
      const title = snack.querySelector(".snack-title")?.textContent ?? ""
      const lines = [...snack.querySelectorAll(".snack-line")].map(
        (l) => l.textContent
      )
      const faces = [...snack.querySelectorAll<HTMLElement>(".snack-face")]
      const scene = places.at(place)
      const heading = scene?.querySelector(".scene-title span")
      if (heading != null) heading.textContent = title
      putLines([...(scene?.querySelectorAll(".line") ?? [])], lines)
      const card = flat.at(place)
      const h4 = card?.querySelector("h4")
      if (h4 != null) {
        h4.textContent = title
        for (const old of card?.querySelectorAll(".scene-copy > h4 ~ p") ?? [])
          old.remove()
        h4.after(
          ...lines.map((text) => {
            const p = document.createElement("p")
            p.textContent = text
            return p
          })
        )
      }
      // The first place's faces are what the skeletons promise: their
      // slots, glyphs and previews.
      if (place === 0) {
        const standing = [
          ...document.querySelectorAll(
            `.skeletons[data-episode="${episode}"] .skeleton`
          ),
        ]
        const promised = [...snack.querySelectorAll(".skeleton")]
        standing.forEach((old, j) => {
          const next = promised.at(j)
          if (next !== undefined) old.replaceWith(next.cloneNode(true))
        })
      }
      faces.forEach((face, j) => {
        const onCube = cubes.at(j)?.at(place)
        if (onCube instanceof HTMLElement)
          putFace(onCube, face, ".band-title span")
        const onCard = [
          ...(card?.querySelectorAll<HTMLElement>(".card") ?? []),
        ].at(j)
        putFace(onCard, face, ".caption p")
        if (onCard != null)
          onCard.setAttribute("style", face.dataset["shape"] ?? "")
      })
    })
  }
}
