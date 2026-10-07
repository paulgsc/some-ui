# Themes and engagement

A good palette makes the app more pleasant to be in, and that plausibly makes
people stay longer and come back. This is a product hypothesis, noted here so it
is weighed whenever engagement is the goal. It came from living with the themes:
the redesign that replaced Strawberry Moon with Rosé Night and Harvest Sky made
the app noticeably more enjoyable to open.

## What backs it

The effect is documented, and it is moderate:

- **Attractive interfaces are judged easier to use.** Kurosu & Kashimura
  (CHI 1995) found people rated better-looking ATM layouts as more usable even
  when they worked the same. Tractinsky (CHI 1997; "What is beautiful is usable",
  _Interacting with Computers_, 2000) replicated it. This is the
  aesthetic-usability effect.
- **The impression forms fast and lasts.** Lindgaard et al. (_Behaviour &
  Information Technology_, 2006) found visual appeal is judged in about 50 ms,
  and that judgment mostly holds afterwards.
- **Mood affects learning.** Um, Plass et al. (_Journal of Educational
  Psychology_, 2012) found a warm palette and round shapes raised learners'
  positive affect and improved comprehension. Plass et al. (_Learning and
  Instruction_, 2014) confirmed the effect on affect, but its effect on learning
  was less consistent.
- **Pleasure drives continued use.** Hassenzahl's AttrakDiff work separates
  pragmatic quality ("does it work") from hedonic quality ("is it pleasant").
  Hedonic quality predicts appeal and coming back.
- **Choosing helps.** Customising an interface raises the sense that it is
  one's own and expresses who one is (Marathe & Sundar, CHI 2011). Picking a
  theme is a small instance of that.

## Caveats

- It multiplies a useful core loop and does not replace one.
- A new palette brings a novelty bump that fades. Judge a theme after weeks, not
  days.
- Taste varies, which is why the vanilla `light` and `dark` themes stay plain
  and familiar while the named themes carry the opinions.

## What this means for future work

- Treat visual polish as engagement work, not decoration. When retention or
  session length is the target, a palette or motion pass belongs on the list
  alongside features.
- Engagement is not measured yet. When it is, record the active theme
  (`data-theme` on `<html>`) with each session, so whether theme choice tracks
  return rate can be checked instead of assumed.
- A theme can only reach what reads its tokens. These still hard-code colour
  and look the same under every theme: LeetType's `diff-card`,
  `constraint-diff` and typing `code-display`, topik's `quiz-summary`, the
  claim/round choice lists, and the soundbites countdown's last-ten-seconds
  amber. "New" also has no token of its own (an `--info` role would give it
  one).
