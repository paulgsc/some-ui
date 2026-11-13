/**
 * The one reading of a pasted YouTube link: Studio's Finish records a
 * released video's link with it, and Studio's Calls a week of the call's.
 * Home reads the same video ids (paulgsc/server `call_week_repo::video`).
 */

const YOUTUBE_ID = /^[\w-]{11}$/

/**
 * The video a pasted YouTube link names, as one link
 * (`https://youtu.be/<id>`); null for anything else.
 */
export function youtubeLink(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const host = url.hostname.replace(/^(www|m)\./, "")
  const path = url.pathname.split("/").filter((part) => part !== "")
  let id: string | null = null
  if (host === "youtu.be" && path.length === 1) id = path[0] ?? null
  else if (host === "youtube.com") {
    if (path[0] === "watch" && path.length === 1) id = url.searchParams.get("v")
    else if (path[0] === "shorts" && path.length === 2) id = path[1] ?? null
  }
  return id !== null && YOUTUBE_ID.test(id) ? `https://youtu.be/${id}` : null
}
