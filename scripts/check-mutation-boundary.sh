#!/usr/bin/env bash
set -euo pipefail

# CI guardrail for Axiom 12.1 in
# crates/hangul-game-core/docs/hangul-progression-canon.typ (§12, ADR 0004):
# a function/method takes T/&T by default. &mut T/&mut self is permitted
# only where a genuine, isolated state transition occurs - confined to the
# smallest possible scope, never re-threaded across more than one
# private-helper call boundary. This scans for &mut self/&mut T parameters
# under hangul-game-core's internal/ tree and fails unless the function is
# on the allow-list below, each entry carrying the reasoning that justified
# keeping it. Sibling to scripts/check-wasm-bindgen-boundary.sh (Axiom 11.1).
#
# Usage: scripts/check-mutation-boundary.sh

cd "$(git rev-parse --show-toplevel)"

CRATE_DIR="crates/hangul-game-core/src/internal"

# "relative/path.rs:fn_name" pairs already reasoned about as genuine,
# isolated state transitions (ADR 0004 §2). Extending this list for a NEW
# function requires the same justification recorded here: show that what it
# mutates truly cannot be computed and returned for the caller to assign
# instead - general convenience is not enough (canon Axiom 12.1).
ALLOWLIST=(
  # GameEngine's own state-machine transition points (Axiom 12.1's named
  # examples): each owns exactly one &mut self and is the entry point every
  # pure helper below it computes a value for, rather than mutating in place.
  "engine.rs:start_timer"
  "engine.rs:process_input"
  "engine.rs:process_backspace"
  "engine.rs:tick"
  "engine.rs:spawn_character"
  "engine.rs:reset"
  # set_mode joins the above as a state-machine transition point in its own
  # right: mode/word_pool are runtime lifecycle state a session can
  # legitimately change (the UI's mode selector), not fixed
  # construction-time configuration - see ADR 0004's set_mode addendum.
  "engine.rs:set_mode"
  # Private helpers one level below the above (#751/#752): each re-borrows
  # the same &mut self its caller already holds for exactly one terminal
  # assignment to a field it owns (self.stats, self.active_reveals,
  # self.completed_cells, self.current_lifetime_ms, self.streak_tokens) -
  # not a second, independently-threaded &mut parameter. The old pattern
  # this replaced - threading a separate &mut EventBatch three levels deep -
  # is exactly what #751 removed; these functions now return their events
  # instead, which is why they are not "helpers with no &mut left" in the
  # literal sense #753's original scope imagined, but they are the isolated
  # transition points Axiom 12.1 actually asks for.
  "engine.rs:advance_or_complete"
  "engine.rs:handle_match"
  "engine.rs:handle_miss"
  "engine.rs:adjust_difficulty_faster"
  "engine.rs:adjust_difficulty_slower"
  # Shared by reset and set_mode: the session-clearing they have in common,
  # factored out so neither duplicates it (still just one re-borrowed &mut
  # self, called once each by its two callers - not a second, independently
  # threaded reference).
  "engine.rs:clear_session_state"
  # GameMode's genuinely stateful methods (#750): initialize/on_match/reset
  # stay &mut self on the trait because CompletionMode/VocabularyMode
  # genuinely mutate in all three (mastery bookkeeping, pool reset).
  # EndlessMode's own no-op bodies don't force a smaller trait shape - one
  # implementation's genuine need is enough (ADR 0004 §2(b)). get_next_challenge
  # and on_miss are deliberately NOT here: #750 already made them &self.
  "game_modes.rs:initialize"
  "game_modes.rs:on_match"
  "game_modes.rs:reset"
  "game_modes/completion.rs:initialize"
  "game_modes/completion.rs:on_match"
  "game_modes/completion.rs:reset"
  "game_modes/endless.rs:initialize"
  "game_modes/endless.rs:on_match"
  "game_modes/endless.rs:reset"
  "game_modes/vocabulary.rs:initialize"
  "game_modes/vocabulary.rs:on_match"
  "game_modes/vocabulary.rs:reset"
  # EventBatch's own builder methods (events.rs), called only by
  # process_input/tick directly on a value they own locally - not handed a
  # live &mut reference to mutate on someone else's behalf. This is the same
  # shape as events.rs::flatten (Prop. 12.2's exemplar): mutating only what
  # you locally own.
  "events.rs:add_secondary"
  "events.rs:add_ui_hint"
)

is_allowed() {
  local candidate="$1"
  for entry in "${ALLOWLIST[@]}"; do
    if [ "$entry" == "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

status=0

while IFS= read -r -d '' file; do
  rel="${file#"$CRATE_DIR"/}"

  # This crate always puts #[cfg(test)] mod tests { ... } at the end of the
  # file - test-only helpers (e.g. push_reveal(engine: &mut GameEngine<..>))
  # are out of this check's scope, so anything at or after that marker is
  # excluded.
  test_start=$(grep -n '^#\[cfg(test)\]' "$file" | head -1 | cut -d: -f1 || true)

  while IFS=: read -r line_no line; do
    if [ -n "$test_start" ] && [ "$line_no" -ge "$test_start" ]; then
      continue
    fi

    fn_name=$(sed -n 's/.*fn[[:space:]]\+\([a-zA-Z0-9_]\+\).*/\1/p' <<<"$line")
    if [ -z "$fn_name" ]; then
      continue
    fi

    candidate="$rel:$fn_name"
    if ! is_allowed "$candidate"; then
      echo "::error::$file:$line_no: fn '$fn_name' takes &mut self/&mut T but is not on scripts/check-mutation-boundary.sh's allow-list"
      status=1
    fi
  done < <(grep -n 'fn [a-zA-Z0-9_]*(.*&mut \(self\|[A-Z]\)' "$file" || true)
done < <(find "$CRATE_DIR" -name '*.rs' -print0)

if [ "$status" -eq 0 ]; then
  echo "OK: every &mut self/&mut T parameter under $CRATE_DIR is on the named allow-list."
fi

exit "$status"
