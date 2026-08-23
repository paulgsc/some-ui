import { DiceCard } from "@some-ui/dice-card"

import type { Milestone } from "../data"

type Props = { milestones: ReadonlyArray<Milestone>; cycleMs?: number }

const MilestoneFace = ({
  milestone,
}: {
  milestone: Milestone
}): React.JSX.Element => (
  <article className="ship-face" data-tone={milestone.tone}>
    <header>
      <span className="ship-badge">{milestone.badge}</span>
      <span>{milestone.tone}</span>
    </header>
    <div className="ship-face__body">
      <p className="ship-kicker">milestone logged</p>
      <h2>{milestone.title}</h2>
      <blockquote>“{milestone.quote}”</blockquote>
      <p className="ship-meta">{milestone.meta}</p>
    </div>
    <dl>
      {milestone.stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  </article>
)

export const MilestoneDice = ({
  milestones,
  cycleMs = 5200,
}: Props): React.JSX.Element => (
  <DiceCard
    cubeId={205}
    className="ship-dice"
    faceClassName="ship-dice__face"
    faces={milestones.map((milestone) => (
      <MilestoneFace key={milestone.title} milestone={milestone} />
    ))}
    dof="Y-axis"
    duration={cycleMs}
    mode="manual"
    showBeam={false}
    hideBackface
  />
)
