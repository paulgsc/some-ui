import { cn } from "some-ui-utils"

import styles from "./index.module.css"

export const TaggartCredits = (): React.JSX.Element => (
  <div className={cn("relative bg-gray-950")}>
    <div className={cn(styles.directed)}>
      <h3>Directed by</h3>
      <h2>Dan Trachtenberg</h2>
    </div>
    <div className={cn(styles.screenplay)}>
      <h3>Screenplay by</h3>
      <h2>
        Jos<span className={cn(styles.hidden, styles.h)}>h</span> Campbell
      </h2>
      <h2>
        <span className={cn(styles.supporting)}>&</span> Matt Stu
        <span className={cn(styles.hidden, styles.e)}>e</span>cken
      </h2>
      <h2>
        <span className={cn(styles.supporting)}>and</span> Damien C
        <span className={cn(styles.hidden, styles.h)}>h</span>azelle
      </h2>
    </div>
    <div className={cn(styles.story)}>
      <h3>Story by</h3>
      <h2>
        Jos<span className={cn(styles.hidden, styles.h)}>h</span> Campbell{" "}
      </h2>
      <h2>
        <span className={cn(styles.supporting)}>&</span> Matt Stueck
        <span className={cn(styles.hidden, styles.e)}>e</span>n
      </h2>
    </div>
    <div className={cn(styles.produced)}>
      <h3>Produced by</h3>
      <h2>
        J.J. A<span className={cn(styles.hidden, styles.b)}>b</span>rams,{" "}
        <span className={cn(styles.credentials)}>p.g.a.</span>
      </h2>
      <h2>
        Linds<span className={cn(styles.hidden, styles.e)}>e</span>y Weber,{" "}
        <span className={cn(styles.credentials)}>p.g.a.</span>
      </h2>
    </div>
  </div>
)
