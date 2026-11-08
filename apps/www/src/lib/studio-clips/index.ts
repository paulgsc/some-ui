/**
 * Studio's clips (SFEED7, epic #2670 decision 5): the Library, every clip
 * kept in paulgsc/testing, read when Clips opens and on Try again
 * (`./read`), and kept for a minute so a clip's page opened from the list
 * shows at once.
 */
import { queryOptions } from "@tanstack/react-query"

import { readStudioClips } from "./read"

export { clipUrl } from "./read"

export const studioClipsQuery = queryOptions({
  queryKey: ["studio", "clips"],
  queryFn: readStudioClips,
  staleTime: 60_000,
  retry: false,
})
