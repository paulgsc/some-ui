import type { Tone } from "../data"

type Item = { tone: Tone; when: string; text: string }
type Props = {
  items: ReadonlyArray<Item>
  activeIndex: number
  onSelect: (index: number) => void
}

export const TimelineAccordion = ({
  items,
  activeIndex,
  onSelect,
}: Props): React.JSX.Element => (
  <section className="ship-timeline" aria-label="How the green happened">
    <div className="ship-section-label">
      <span>02</span>
      <h2>How the green happened</h2>
    </div>
    <ol>
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <li key={item.when} data-tone={item.tone} data-active={active}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-expanded={active}
            >
              <span className="ship-timeline__number">0{index + 1}</span>
              <span className="ship-timeline__copy">
                <strong>{item.when}</strong>
                <span>{item.text}</span>
              </span>
              <span className="ship-timeline__toggle" aria-hidden>
                {active ? "−" : "+"}
              </span>
            </button>
            <div className="ship-timeline__progress">
              <span />
            </div>
          </li>
        )
      })}
    </ol>
  </section>
)
