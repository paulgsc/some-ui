//! The immutable, pre-computed view of one chunk of source code.
//!
//! Everything in this module is a pure function of the source string: it is
//! compiled once per chunk and then only ever read (`&self`), never mutated.
//!
//! # The typeable stream
//!
//! The overlay UI puts the caret directly on the rendered source, so the
//! caret and the code must agree character-for-character. That fidelity is
//! only bearable if the player never has to *reproduce* layout whitespace:
//! indentation is the machine's job, tokens are the player's job. So every
//! rendered character carries a [`Role`]:
//!
//! - [`Role::Typeable`] — the player must press a key for it.
//! - [`Role::Skip`] — layout the caret jumps over (indentation, line
//!   breaks, alignment padding, trailing whitespace).
//!
//! The classification rule is deliberately one sentence: **a run of
//! whitespace is typeable only when it is exactly one space bounded on both
//! sides by non-whitespace.** Because the runs are maximal, that single
//! condition already excludes leading indentation (the run starts the
//! source or abuts a newline), alignment padding (length > 1), line breaks
//! (the run contains `\n`), and trailing whitespace (the run ends the
//! source or abuts a newline). One interior space is a real token the
//! player types; everything else is layout the caret flies through.

use serde::{Deserialize, Serialize};

/// Whether a rendered source character is typed by the player or skipped
/// over by the caret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// Layout the caret auto-advances through.
    Skip,
    /// A slot in the typeable stream; the player owes it one keystroke.
    Typeable,
}

impl Role {
    /// Compact wire encoding, so the whole role vector can cross the WASM
    /// boundary once per chunk as a `Uint8Array` instead of a boxed array.
    #[must_use]
    pub const fn as_code(self) -> u8 {
        match self {
            Self::Skip => 0,
            Self::Typeable => 1,
        }
    }
}

/// A navigable region of the chunk, used by the skip/resume UI.
///
/// Sections are cut at top-level (column-zero, non-blank) lines, which for
/// every language this game ships is where a human would say "the next
/// thing" begins: an import, a type, a function, a block comment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    /// Position of this section in [`Program::sections`].
    pub index: usize,
    /// The section's opening line, trimmed and truncated for display.
    pub label: String,
    /// Zero-based, inclusive.
    pub start_line: usize,
    /// Zero-based, exclusive.
    pub end_line: usize,
    /// First slot of the typeable stream inside this section.
    pub start_slot: usize,
    /// One past this section's last slot.
    pub end_slot: usize,
    /// Rendered-character index this section opens at.
    pub start_display: usize,
}

impl Section {
    /// How many keystrokes this section is worth.
    #[must_use]
    pub const fn slot_count(&self) -> usize {
        self.end_slot - self.start_slot
    }
}

/// A **run**: the unit the reveal window counts in (`k` runs ahead of the
/// caret are unmasked — see `super::reveal`).
///
/// The alternative was the slot, and it is wrong for this job: revealing
/// "the next three slots" of `or_insert_with` reveals `or_`, which is noise
/// rather than a hint. The alternative on the other side — the lexical
/// token — would require the engine to know something about the language,
/// which it deliberately does not.
///
/// A run is the defensible middle, and it is derivable from the [`Role`]
/// classification alone: a maximal span of adjacent typeable, non-whitespace
/// slots. Layout breaks a run (indentation, a newline) because the caret
/// flies over it, and the lone interior space breaks one because a space is
/// not a thing anybody has to retrieve. So `HashMap::new();` is one run,
/// `let mut map` is three, and no language knowledge was consulted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    /// First slot of the run.
    pub start_slot: usize,
    /// One past the run's last slot.
    pub end_slot: usize,
}

impl Run {
    /// Whether `slot` falls inside this run.
    #[must_use]
    pub const fn contains(&self, slot: usize) -> bool {
        slot >= self.start_slot && slot < self.end_slot
    }
}

/// Longest section label kept before ellipsizing.
const LABEL_MAX_CHARS: usize = 56;

/// One chunk of source, compiled into everything the engine and the
/// renderer need to agree on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Program {
    chars: Vec<char>,
    roles: Vec<Role>,
    /// slot ordinal -> rendered-character index.
    slot_display: Vec<usize>,
    /// rendered-character index -> slot ordinal, or `None` when skipped.
    display_slot: Vec<Option<usize>>,
    sections: Vec<Section>,
    runs: Vec<Run>,
}

impl Program {
    /// Compile a chunk of source into its typeable stream and sections.
    #[must_use]
    pub fn compile(source: &str) -> Self {
        let chars: Vec<char> = source.chars().collect();
        let roles = classify(&chars);

        let mut slot_display = Vec::new();
        let mut display_slot = Vec::with_capacity(chars.len());
        for (index, role) in roles.iter().enumerate() {
            match role {
                Role::Typeable => {
                    display_slot.push(Some(slot_display.len()));
                    slot_display.push(index);
                }
                Role::Skip => display_slot.push(None),
            }
        }

        let sections = build_sections(&chars, &display_slot, slot_display.len());
        let runs = build_runs(&chars, &slot_display);

        Self {
            chars,
            roles,
            slot_display,
            display_slot,
            sections,
            runs,
        }
    }

    /// Number of rendered characters.
    #[must_use]
    pub const fn display_len(&self) -> usize {
        self.chars.len()
    }

    /// Number of keystrokes this chunk is worth.
    #[must_use]
    pub const fn slot_count(&self) -> usize {
        self.slot_display.len()
    }

    /// The character a given slot expects.
    #[must_use]
    pub fn slot_char(&self, slot: usize) -> Option<char> {
        self.slot_display.get(slot).and_then(|&index| self.chars.get(index)).copied()
    }

    /// Where a given slot sits in the rendered source. Slots past the end
    /// resolve to one-past-the-last character, which is where the caret
    /// parks when the chunk is finished.
    #[must_use]
    pub fn slot_display_index(&self, slot: usize) -> usize {
        self.slot_display.get(slot).copied().unwrap_or(self.chars.len())
    }

    /// Wire encoding of every character's role.
    #[must_use]
    pub fn role_codes(&self) -> Vec<u8> {
        self.roles.iter().map(|role| role.as_code()).collect()
    }

    /// Wire encoding of the rendered-character -> slot map, with `-1`
    /// standing in for skipped characters.
    #[must_use]
    pub fn slot_of_display_codes(&self) -> Vec<i32> {
        self.display_slot.iter().map(|slot| slot.map_or(-1, i32_from_slot)).collect()
    }

    /// The chunk's navigable sections, in source order.
    #[must_use]
    pub fn sections(&self) -> &[Section] {
        &self.sections
    }

    /// The section a slot belongs to, if any.
    #[must_use]
    pub fn section_of_slot(&self, slot: usize) -> Option<&Section> {
        self.sections.iter().find(|section| slot >= section.start_slot && slot < section.end_slot)
    }

    /// The chunk's reveal units, in slot order.
    #[must_use]
    pub fn runs(&self) -> &[Run] {
        &self.runs
    }

    /// Where the reveal window starts for a caret on `slot`: the run holding
    /// it, or — when the caret sits on a lone interior space, or past the end
    /// — the first run after it.
    ///
    /// Total by construction: a caret past the last run yields `runs().len()`,
    /// which is an empty window rather than a panic.
    #[must_use]
    pub fn run_index_at_or_after(&self, slot: usize) -> usize {
        self.runs.iter().position(|run| run.contains(slot) || run.start_slot > slot).unwrap_or(self.runs.len())
    }

    /// Whether the slot's expected character is whitespace — the lone
    /// interior space, the only whitespace that owns a slot at all. Never
    /// masked: a space is not a competency, and hiding one would only cost
    /// the player a guess about which invisible character they owe.
    #[must_use]
    pub fn slot_is_space(&self, slot: usize) -> bool {
        self.slot_char(slot).is_some_and(char::is_whitespace)
    }
}

/// Slot ordinals are bounded by the chunk size (a few thousand), so this
/// saturating narrowing can never actually lose information here - it just
/// keeps the JS-facing map a plain `Int32Array`.
fn i32_from_slot(slot: usize) -> i32 {
    i32::try_from(slot).unwrap_or(i32::MAX)
}

/// Assign a [`Role`] to every rendered character (see the module docs for
/// the rule this implements).
fn classify(chars: &[char]) -> Vec<Role> {
    let mut roles = vec![Role::Typeable; chars.len()];
    let mut index = 0;

    while index < chars.len() {
        if !chars[index].is_whitespace() {
            index += 1;
            continue;
        }

        let run_start = index;
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }

        let is_lone_interior_space = index - run_start == 1 && chars[run_start] == ' ' && run_start > 0 && index < chars.len();

        if !is_lone_interior_space {
            for role in &mut roles[run_start..index] {
                *role = Role::Skip;
            }
        }
    }

    roles
}

/// Half-open rendered-character range of one source line, newline excluded.
struct Line {
    start: usize,
    end: usize,
}

fn split_lines(chars: &[char]) -> Vec<Line> {
    let mut lines = Vec::new();
    let mut start = 0;

    for (index, &ch) in chars.iter().enumerate() {
        if ch == '\n' {
            lines.push(Line { start, end: index });
            start = index + 1;
        }
    }
    lines.push(Line { start, end: chars.len() });

    lines
}

fn is_blank(chars: &[char], line: &Line) -> bool {
    chars[line.start..line.end].iter().all(|ch| ch.is_whitespace())
}

/// A line that closes the construct above it (`}`, `);`, `]`, …) reads as
/// the tail of that construct, not the head of a new one — cutting there
/// would fill the picker with one-brace entries nobody wants to jump to.
const CLOSING_DELIMITERS: [char; 5] = ['}', ')', ']', ';', ','];

fn opens_section(chars: &[char], line: &Line) -> bool {
    if is_blank(chars, line) {
        return false;
    }
    chars.get(line.start).is_some_and(|ch| !ch.is_whitespace() && !CLOSING_DELIMITERS.contains(ch))
}

fn label_for(chars: &[char], lines: &[Line], from_line: usize) -> String {
    let opening = lines[from_line..].iter().find(|line| !is_blank(chars, line)).unwrap_or(&lines[from_line]);

    let text: String = chars[opening.start..opening.end].iter().collect();
    let trimmed = text.trim();

    if trimmed.chars().count() <= LABEL_MAX_CHARS {
        return trimmed.to_owned();
    }

    let head: String = trimmed.chars().take(LABEL_MAX_CHARS).collect();
    format!("{}…", head.trim_end())
}

/// Cut the chunk at every column-zero, non-blank line, then fold away any
/// section that carries no keystrokes of its own (a run of blank lines, or
/// a leading indented preamble) so the picker never offers a dead entry.
fn build_sections(chars: &[char], display_slot: &[Option<usize>], slot_count: usize) -> Vec<Section> {
    if slot_count == 0 {
        return Vec::new();
    }

    let lines = split_lines(chars);
    let slots_before = prefix_slot_counts(display_slot);

    let mut starts: Vec<usize> = (0..lines.len()).filter(|&index| opens_section(chars, &lines[index])).collect();
    if starts.first() != Some(&0) {
        starts.insert(0, 0);
    }

    let mut sections: Vec<Section> = Vec::with_capacity(starts.len());
    for (position, &start_line) in starts.iter().enumerate() {
        let end_line = starts.get(position + 1).copied().unwrap_or(lines.len());
        let start_display = lines[start_line].start;
        let end_display = starts.get(position + 1).map_or(chars.len(), |&next| lines[next].start);

        sections.push(Section {
            index: 0,
            label: label_for(chars, &lines, start_line),
            start_line,
            end_line,
            start_slot: slots_before[start_display],
            end_slot: slots_before[end_display],
            start_display,
        });
    }

    let mut folded: Vec<Section> = Vec::with_capacity(sections.len());
    for section in sections {
        if section.slot_count() == 0 {
            if let Some(previous) = folded.last_mut() {
                previous.end_line = section.end_line;
                previous.end_slot = section.end_slot;
                continue;
            }
        }
        match folded.last_mut() {
            Some(previous) if previous.slot_count() == 0 => {
                previous.label = section.label;
                previous.end_line = section.end_line;
                previous.end_slot = section.end_slot;
            }
            _ => folded.push(section),
        }
    }

    for (index, section) in folded.iter_mut().enumerate() {
        section.index = index;
    }

    folded
}

/// Cut the typeable stream into [`Run`]s: maximal spans of adjacent,
/// non-whitespace slots.
///
/// "Adjacent" is measured in *display* indices, not slot ordinals — two
/// consecutive slots separated by skipped layout (a newline and the
/// indentation after it) belong to different runs even though their slot
/// numbers are consecutive. That is the whole point: the run boundary is
/// where the eye stops, and the eye stops at whitespace.
fn build_runs(chars: &[char], slot_display: &[usize]) -> Vec<Run> {
    let mut runs: Vec<Run> = Vec::new();

    for (slot, &display) in slot_display.iter().enumerate() {
        if chars.get(display).is_some_and(|ch| ch.is_whitespace()) {
            continue;
        }

        let continues = runs
            .last()
            .is_some_and(|run: &Run| run.end_slot == slot && slot_display.get(slot - 1).is_some_and(|&previous| previous + 1 == display));

        if continues {
            if let Some(run) = runs.last_mut() {
                run.end_slot = slot + 1;
            }
        } else {
            runs.push(Run {
                start_slot: slot,
                end_slot: slot + 1,
            });
        }
    }

    runs
}

/// `result[i]` = how many slots sit strictly before rendered character `i`.
fn prefix_slot_counts(display_slot: &[Option<usize>]) -> Vec<usize> {
    let mut counts = Vec::with_capacity(display_slot.len() + 1);
    let mut seen = 0;
    counts.push(0);
    for slot in display_slot {
        if slot.is_some() {
            seen += 1;
        }
        counts.push(seen);
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::{Program, Role};

    fn roles_of(source: &str) -> Vec<Role> {
        Program::compile(source).roles
    }

    fn typed_stream(source: &str) -> String {
        let program = Program::compile(source);
        (0..program.slot_count()).filter_map(|slot| program.slot_char(slot)).collect()
    }

    #[test]
    fn lone_interior_space_is_typeable() {
        assert_eq!(typed_stream("let x = 1"), "let x = 1");
    }

    #[test]
    fn leading_indentation_is_skipped() {
        assert_eq!(typed_stream("    let x = 1"), "let x = 1");
    }

    #[test]
    fn alignment_padding_is_skipped() {
        assert_eq!(typed_stream("a  =  1"), "a=1");
    }

    #[test]
    fn newlines_and_the_indentation_after_them_are_skipped() {
        assert_eq!(typed_stream("fn a() {\n    b();\n}"), "fn a() {b();}");
    }

    #[test]
    fn trailing_whitespace_is_skipped() {
        assert_eq!(typed_stream("done   "), "done");
        assert_eq!(roles_of("done   ").last(), Some(&Role::Skip));
    }

    #[test]
    fn slot_display_index_tracks_the_rendered_source() {
        let program = Program::compile("  ab\n c");
        // rendered: [' ', ' ', 'a', 'b', '\n', ' ', 'c']
        assert_eq!(program.slot_count(), 3);
        assert_eq!(program.slot_display_index(0), 2);
        assert_eq!(program.slot_display_index(1), 3);
        assert_eq!(program.slot_display_index(2), 6);
        // one past the end: where the caret parks when the chunk is done
        assert_eq!(program.slot_display_index(3), 7);
    }

    #[test]
    fn role_and_slot_maps_agree_with_each_other() {
        let program = Program::compile("fn a() {\n    b();\n}\n");
        let roles = program.role_codes();
        let slots = program.slot_of_display_codes();

        assert_eq!(roles.len(), program.display_len());
        assert_eq!(slots.len(), program.display_len());

        for (index, &code) in roles.iter().enumerate() {
            if code == 1 {
                assert!(slots[index] >= 0, "typeable char {index} has no slot");
            } else {
                assert_eq!(slots[index], -1, "skipped char {index} claims a slot");
            }
        }
    }

    #[test]
    fn sections_cut_at_column_zero_and_cover_every_slot() {
        let source = "import a\n\nfn one() {\n    body();\n}\n\nfn two() {\n    body();\n}\n";
        let program = Program::compile(source);
        let sections = program.sections();

        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].label, "import a");
        assert_eq!(sections[1].label, "fn one() {");
        assert_eq!(sections[2].label, "fn two() {");

        assert_eq!(sections[0].start_slot, 0);
        assert_eq!(sections.last().map(|s| s.end_slot), Some(program.slot_count()));
        for pair in sections.windows(2) {
            assert_eq!(pair[0].end_slot, pair[1].start_slot);
        }
    }

    #[test]
    fn sections_never_carry_zero_slots() {
        let program = Program::compile("\n\n\nfn a() {}\n\n\n");
        assert!(program.sections().iter().all(|section| section.slot_count() > 0));
    }

    #[test]
    fn an_indented_preamble_folds_into_the_first_real_section() {
        let program = Program::compile("    stray\nfn a() {}\n");
        let sections = program.sections();
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].start_slot, 0);
    }

    #[test]
    fn empty_source_compiles_to_nothing() {
        let program = Program::compile("");
        assert_eq!(program.slot_count(), 0);
        assert_eq!(program.display_len(), 0);
        assert!(program.sections().is_empty());
    }

    #[test]
    fn whitespace_only_source_has_no_slots() {
        let program = Program::compile("   \n\t\n  ");
        assert_eq!(program.slot_count(), 0);
        assert!(program.sections().is_empty());
    }

    #[test]
    fn section_of_slot_finds_the_owning_section() {
        let program = Program::compile("fn one() {\n    a();\n}\nfn two() {\n    b();\n}\n");
        let last_slot = program.slot_count() - 1;
        assert_eq!(program.section_of_slot(0).map(|s| s.index), Some(0));
        assert_eq!(program.section_of_slot(last_slot).map(|s| s.index), Some(1));
        assert!(program.section_of_slot(program.slot_count()).is_none());
    }

    #[test]
    fn long_labels_are_ellipsized() {
        let long = "x".repeat(120);
        let program = Program::compile(&format!("{long}\n"));
        let label = &program.sections()[0].label;
        assert!(label.ends_with('…'));
        assert_eq!(label.chars().count(), super::LABEL_MAX_CHARS + 1);
    }
}
