# @some-ui/game-scenarios

The fixed set of NFL game-week scenarios a bite is said about (Game Week
Bites, #2074, story GWB1). Each bite is commentary on one scenario: before
kickoff, during the game, after the final, or about my own watching. Every
game is read through one team, "us", and an outcome "for us" is the one that
team wants.

## One source, two readers

paulgsc/server's `crates/game_scenarios` holds the set. Its scenario engine
compiles against it, and `dump-game-scenarios` writes it as JSON. This package
keeps that JSON as `src/game-scenarios.snapshot.json` and adds how some-ui
draws each scenario:

- `src/icons.ts`: a 24x24 stroke icon per scenario. A meaning that recurs
  (watching, not watching, for us, against us, the paths) is drawn by the same
  primitive in every icon.
- `src/words.ts`: the phase headings, and a label for every outcome.

`SCENARIOS` joins the three, in the catalog's order. `CATALOG_VERSION` is the
version every bite and weekly bundle records.

## What keeps the two sides together

- The server's `scripts/check_client_fixtures.py` fails any server PR whose
  dump differs from this copy.
- This package's tests fail when an id or outcome in the copy has no icon or
  words here, or the other way round.

To change the set, change the server first (its crate README says how, and
the owner decides each change). Then regenerate the copy here and add the icon
and words in a PR that lands before the server's:

```sh
cargo run -q --bin dump-game-scenarios > packages/game-scenarios/src/game-scenarios.snapshot.json
```

Never edit the copy by hand.
