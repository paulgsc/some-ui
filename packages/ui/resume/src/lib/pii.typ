// Contact details that are personal (PII), supplied per build and never
// committed.
//
// Never a typst `--input`: only `compileWithPii`'s stdin program passes them
// (RP1, README.md "Scope and limits").
//
// src/pii/envelope.json is the one statement of what each field may hold
// (`fields`) and which templates render them (`templates`). It
// is checked here, in the document, rather than in the service or the page:
// this is the one place every build passes through, so a value outside the
// envelope fails the compile whichever way it was started. The assertion
// messages name the field and its limit, never the value, because the service
// returns them to the page and must never echo or log what was sent.
//
// Where the fields render: only the contact line of the templates the
// envelope's `templates` lists, the ATS ones. rail and compact never take
// them, and nor does the `<resume-export>` metadata in src/resume.typ that feeds
// the public web view.

#let pii-envelope = json("../pii/envelope.json")
#let envelope = pii-envelope.fields

// Checks `given` (a dictionary, or `none` for no PII) for `template`.
// Returns a dictionary with every envelope field present, each a string or
// `none`.
#let read-pii(given, template) = {
  if given == none { given = (:) }
  assert(
    type(given) == dictionary,
    message: "pii: expected a JSON object of contact fields",
  )
  for key in given.keys() {
    assert(
      key in envelope,
      message: "pii: unknown field '" + key + "' — expected one of "
        + envelope.keys().join(", "),
    )
  }
  let out = (:)
  for (key, rule) in envelope {
    let value = given.at(key, default: none)
    if value != none {
      assert(type(value) == str, message: "pii." + key + ": expected text")
      value = value.trim()
      if value == "" { value = none }
    }
    if value != none {
      // Code points, not bytes: `str.len()` counts UTF-8 bytes.
      assert(
        value.codepoints().len() <= rule.maxLength,
        message: "pii." + key + ": longer than " + str(rule.maxLength)
          + " characters",
      )
      assert(
        value.match(regex(rule.pattern)) != none,
        message: "pii." + key + ": not a valid " + lower(rule.label)
          + " (for example " + rule.example + ")",
      )
    }
    out.insert(key, value)
  }
  // The templates' own contact-line calls are what render PII; this keeps
  // the envelope's list, which the service and the page offer, honest.
  assert(
    template in pii-envelope.templates or out.values().all(v => v == none),
    message: "pii: the " + template + " template renders no contact fields — "
      + "use one of " + pii-envelope.templates.join(", "),
  )
  out
}
