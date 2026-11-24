# Grafana chapters (from ESSAY-SCHEMA, 2026-11-24, as of #3497 + #3498, both open)

- No `from: "dashboards"`. A dashboard is a walk:
  `{"kind":"screen","of":{"from":"walks","run":"<Snips Capture run>","app":"home-call","steps":[1,3]}}`
  - home-call: 1 "Each week made into a video", 2 "Rust Rounds essays", 3 "Mock interview essays"
  - home-pipelines: 1 weekly call's pipeline graph, 2 engagement report's
  - After #3498 merges, one Snips Capture dispatch walks both into the walks bundle with the APK walks:
    name that one run for all the essay's walks.
- Sample Monday: every pass green; Rust Rounds and interview essays "waiting for the deadline: 1",
  given 0; Rust LONGEST WAIT "no data". Weekly call rendered Sunday. Band "Sample data: a made-up
  week, not home's" on every screen: say so in narration, never as home's numbers.
- SHOW1: a scene line saying "Grafana" or citing server infra/grafana/dashboards/\*\* needs a
  home-call/home-pipelines walk in that chapter. A dashboard walk does NOT count as showing the app.
- nixos-upgrade showcase now fails SHOW1 (names Grafana's upgrades dashboard): don't copy that shape.
