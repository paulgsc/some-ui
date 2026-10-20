# Pull Request Template

## Description

Please include a summary of the changes and the related issue. Please also include relevant motivation and context.

## Superseded

What this change made obsolete (code, tests, docs) and removed, or "None" and why. If it adds
something existing code already does, name that code and say why both must exist.

## Change kind

One line, `Change-Kind: story` (the user story moved: behaviour added or retired) or
`Change-Kind: defect` (code failed in a state its story already covered). See `CLAUDE.md`,
"Two kinds of pull request".

## The promise (defect only)

For a defect, give:

- the promise this PR declares: its ID and where it lives;
- its **Claim**;
- its **Family**, every state or environment it covers;
- its **Proof**, what holds it over that family;
- which check could have caught the failure, and why none did.

For a story, write "Story: nothing to prove".

## Type of Change

Please delete options that are not relevant.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules

## Screenshots

Please add any relevant screenshots for changes that affect the UI.
