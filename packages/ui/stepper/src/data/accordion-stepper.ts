import type { AccordionSteps } from "@stepper/types/accordion-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "NFL research plan",
  },
  data: [
    {
      stepId: "item-1",
      title: "some title",
      progress: "done",
      content: `
      hey me want to test you research capabilities. see ever curious about
      this question, what is the distance relationship between nfl players
      and coaching/ownership. This is the abstract: I claim that nfl
      rosters, either through the draft, or through free agency and then
      reinforced in training camp and final 53 are strongly influenced by
      informal social networks between players, agents, coaches, and upper
      management. That is there is a strong correlation between "distance
      relationships" i.e shared alumni, previous teams, agencies etc and
      roster spots. In the interest of evaluating this claim, I would first
      like to gather data that tracks a cohort of players and coaches, and
      their previous/current teams/alumni in a training vs predictive data
      set model. with just this prompt do your best effort research to
      generate a thingy. me curious what you can do. (1) Find official NFL
      team rosters for the current year (2025) and previous years to
        identify a cohort of players. (2) For the selected cohort of players,
      research their college affiliations and previous professional teams.
        (3) Identify the current coaching staff for each team where the
      selected players are on the roster, and research their previous
      coaching positions and college affiliations. (4) For the same cohort
      of players, find information about their representation, such as their
      agents or agencies. (5) Research the ownership and key management
      personnel for each team where the selected players are on the roster,
        looking for any publicly available information about their college
          affiliations or previous team connections. (6) Search for information
            on NFL training camp rosters and compare them to the final 53-man
      rosters for the selected cohort of players to understand player
        movement. (7) Look for any publicly available databases or articles
          that track connections or relationships between NFL players, coaches,
      agents, and team management. (8) Investigate if there are any sports
        analytics websites or resources that provide data on player
      recruitment and team building strategies, potentially highlighting the
      influence of prior relationships.
        `,
    },
    {
      stepId: "item-2",
      title: "some title",
      progress: "done",
      content: "some content",
    },
    {
      stepId: "item-3",
      progress: "pending",
      title: "some title",
      content: "some content",
    },
    {
      stepId: "item-3",
      title: "some title",
      progress: "scheduled",
      content: "some content",
    },
    {
      stepId: "item-3",
      title: "some title",
      progress: "scheduled",
      content: "some content",
    },
  ],
}
