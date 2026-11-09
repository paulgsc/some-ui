/**
 * What is said over the sample season's episodes (SFEED12, #2757): a fixed
 * fill of the legend and of the sample's newest week, written once by hand
 * and kept in code, so a template's preview is said from the sample alone,
 * with no model called. It is checked as any fill is (`checkNarration`,
 * `__tests__/sample-fill.test.ts`), and pinned to the newest version of each
 * format, so a preview always draws the template as it stands. A change to
 * the slides or the sample season that the words no longer fit fails that
 * test until they are written again.
 */

import { pinsOf, type Narration } from "./narration"
import { SAMPLE_SEASON, sampleWeekOf } from "./sample"
import type { FormatKind } from "./show"
import { slidesOf, type SlideId } from "./slides"

/** What is said over each slide: the legend's, and the sample's newest week's. */
const SAID: Readonly<Record<SlideId, string>> = {
  legend:
    "Every week, I give you two numbers about our rivals: the best case and the worst case. Then I tell you which way the week moved us.",
  pieces:
    "A game is named by who plays it. Our light is us, and a win always helps. A one-way game is a rival against the other conference. A crossroads is two rivals, where one of them gets the win whichever way it goes. A side street is two teams outside our conference, never on our route.",
  poles:
    "The floor is the fewest wins our best rival can be held to, if everything goes our way. The bloc is rivals who still play each other, so one of them reaches the floor. The ceiling is the most wins a rival can still reach, if everything goes against us. Before a snap, the floor is two for our division and six for our conference.",
  moves:
    "Each result moved us toward the best case, toward the worst case, was forced, or was idle. Forced means two rivals played, and one of them had to win. Idle means neither pole moved. A clean run is a week where neither floor rose and our best finish held.",
  objectives:
    "We play for the division and the number one seed. Each is clinched, in our hands, needs help, or out. Greens to go counts what still has to break our way, and reds to spare counts what we can still give up.",
  calls:
    "The ladder runs from the number one seed, to a division title, to a wild card, to out. Keep driving means there is more to see. Arrived means the rest of the season can't change where we land. Dead end means no seat is left.",
  division:
    "In our division, the floor rose from thirteen to fourteen, and the ceiling held at fourteen. The Seahawks already have fourteen wins, so they set the floor themselves. We finish with twelve.",
  conference:
    "Across the conference it's the same: the floor rose from thirteen to fourteen, the ceiling held at fourteen, and the Seahawks hold it.",
  results:
    "This week, one result moved us toward the worst case, and seven were forced.",
  standings: "The division is out of reach, and so is the number one seed.",
  ladder:
    "We land on a wild card whatever happens. We've arrived: the rest can't change our rung.",
  season:
    "Over eighteen weeks, our division's floor climbed from two to fourteen, while its ceiling came down from seventeen to fourteen. In the conference, the floor went from six to fourteen. In all, fifteen steps went our way and thirteen went against us.",
  outro:
    "No steps our way this week, and two against us. The division and the top seed are gone, but a wild card is ours whatever happens. That's the series for the Niners.",
}

/** The sample season's fill of `kind`'s episode, in the format's newest version. */
export async function sampleFill(kind: FormatKind): Promise<Narration> {
  return {
    ...(await pinsOf(SAMPLE_SEASON, sampleWeekOf(kind))),
    scenes: slidesOf(kind).map((id) => ({ id, said: SAID[id] })),
  }
}
