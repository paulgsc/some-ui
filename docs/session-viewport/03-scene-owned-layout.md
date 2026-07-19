# A layout tree belongs to the scene: one source of truth, three forks retired

> **Superseded.** This story's code was never merged (it lived on a branch
> and was unwound before landing) and its central premise - the scene owns
> its own topology - was overturned by a follow-up architecture discussion
> on #693/#696: topology moved to the _session_, not the scene, and chrome
> was decided to live entirely outside the tree rather than joining it.
> Kept here, unmodified, as the historical record of what was tried and
> why it changed - see #693's current epic body for the live decision, and
> #696 for the story that replaced this one. Read
> `01-overflow-doctrine-and-audit.md` and `02-kill-the-cutoff.md` first for
> context that's still current - this doc's own findings below are not.

> Findings for epic #693, story 3 (#696). Read `01-overflow-doctrine-and-audit.md`
> and `02-kill-the-cutoff.md` first - this story gives `Layout(t)` an owner;
> it does not change how a bounded `V` is measured or clipped.

## The decision (recorded on #696, quoted here for the permanent record)

> The architectural decision is to adopt a **nested ownership model**. A
> session is understood as an exogenous composition of scenes rather than an
> entity that dictates their internal presentation. Consequently, the
> application owns a **shell layout**, responsible for persistent chrome such
> as navigation, sidebars, overlays, transport controls, and voice UI. Each
> individual scene owns an independent **content layout**, responsible solely
> for the pedagogical arrangement of its instructional panels. The shell
> exposes a content slot into which the active scene's layout is composed.
>
> Topology, binding, and geometry are distinct layers of the layout system and
> must remain so. Topology is the persistent structural tree describing
> spatial relationships between regions. Binding is the persistent association
> between structural slots and registered UI components. Geometry is the
> transient solution produced by the layout solver for a particular viewport,
> focus state, and animation frame. Only topology and binding belong in
> persisted state; geometry remains a pure derivation.
>
> Layout templates become strictly an initialization mechanism rather than a
> runtime dependency. `dramaTree`, `studyTree`, `voiceTree`, `topikTree`, and
> the dormant `layoutTreeFor()` serve only to seed newly created scenes with
> an initial topology. Once instantiated, ownership transfers immediately to
> the scene itself.

Two concrete scope boundaries follow from this for story 3, worth naming
explicitly:

- **The shell tree is not implemented here.** Chrome (sidebar/navbar/bottom
  controls) is still bespoke flex/grid - the nested-ownership _decision_ is
  recorded, but building the outer shell tree with a `content` slot the scene
  composes into is story 5 (#698, chrome-as-layout-nodes). This story only
  gives the _scene's own_ topology a real home.
- **Binding beyond `mainContent` is not implemented here.** The activity
  catalog still only knows how to bind one registry component per scene (see
  "Finding" below) - populating the other regions a template describes is
  story 4 (#697, slot registry) and story 6 (#699, temporal overflow)
  territory.

## What changed

**Topology got a home next to binding.** `SceneConfig.layout` (packages/types
`orchestrator-types`) is a new optional field carrying a `LayoutTreeNode` -
structurally identical to `wireframes`' `LayoutNode<YouTubeRegion>`, declared
independently so `some-types-utils` doesn't take a dependency on the `ui`
layer that already depends on it. It sits next to `ui` (binding) on the same
object, exactly the "give topology a home next to binding" shape the story
proposed. The same field was added to `ActiveLifetime.kind.Scene` (the
runtime projection) and threaded through in
`packages/utils`' `mock-orchestrator-engine.ts#buildActiveLifetimes`, so a
scene's layout survives the trip from authored `SceneConfig` to what the
player actually reads at render time.

**Three forks collapsed into one read path.**
`packages/ui/wireframes/src/hooks/use-scene-driven-layout.ts` is now the
single place `Layout(t)` is read from: `usePrimaryScene().kind.Scene.layout`,
nothing else. No scene-name dispatch table, no per-route special case.

1. **Player** (`apps/www/src/components/player/session-viewport.tsx`) - used
   to hardcode `MAIN_CONTENT_LAYOUT` (`player/layout.ts`) unconditionally. Now
   calls `useSceneDrivenLayout()` and falls back to a `FALLBACK_LAYOUT`
   single-leaf tree (same file, renamed) only when a scene has no persisted
   `layout` - a safety net for legacy data, not the source of truth.
2. **Overlay route** (`apps/www/src/routes/overlays/youtube.tsx`) - already
   called `useSceneDrivenLayout()`, so it needed no edit at all; it inherits
   the fix because the hook it already depended on now reads the right thing.
   Its `SceneName`-keyed dispatch table
   (`packages/ui/wireframes/src/types/layout-trees-map.ts`,
   `SCENE_LAYOUT_MAP`/`SceneName`) is **deleted**, not just unused - a repo
   grep confirmed zero consumers outside the hook itself once the hook stopped
   using it (the map's keys - `cdrama`/`assessment`/`hangulTyping`/etc. -
   never matched real `scene_name`s the activity catalog produces anyway;
   this fork was already silently dead for all real sessions before today).
3. **Composer** (`apps/www/src/components/composer/arrangement-step.tsx`) -
   `LayoutEditor` was mounted with zero props, a fully local `useState`
   sandbox explicitly labeled "exploration only, does not change your
   session." `LayoutEditor` (`packages/ui/wireframes/.../layout-crm`) now
   takes optional `value`/`onChange` props (controlled when passed, falls
   back to its old internal state when omitted, so the existing
   uncontrolled Storybook story keeps working unmodified). The composer adds
   a scene picker and passes the selected scene's own `layout` in and its
   `onChange` writes straight back into that scene via the existing
   `onScenesChange` plumbing - "explore the layout engine" is now "edit this
   scene's layout," literally.

**`layoutTreeFor` got a real consumer.** `apps/www/src/lib/activity-catalog`
gained `layout-templates.ts`, mapping each `LayoutTreeId`
(`study`/`topik`/`drama`/`voice`) to the actual template tree from
`wireframes`. `toSceneConfig` now sets `scene.layout` to
`structuredClone(LAYOUT_TEMPLATES[layoutTreeFor(activityId)])` - a clone so
two scenes (or two instances of the same repeated activity) never alias the
same tree object or the shared template. This is exactly what the story's
proposed shape names: "start with the per-activity `layoutTree` that already
exists in the catalog - finally give `layoutTreeFor` a consumer." From the
moment a scene is created, its `layout` is its own; nothing reads
`LAYOUT_TEMPLATES` again afterward for that scene.

## Finding: seeding from the named template surfaces empty regions today

Verified live (composer → Save & Play → real Hangul Honeycomb session): the
player now renders `studyTree`'s full topology - a `title` bar, the
`mainContent` game, and `sidebarTop`/`sidebarBottom` - because `layoutTreeFor`
maps `honeycomb` to `"study"`. Only `mainContent` has a bound panel
(`toSceneConfig` still only ever populates `ui[0].panels.mainContent`), so
`title`/`sidebarTop`/`sidebarBottom` render as the sanctioned unbound-leaf
placeholder (`OrchestratedYouTubeViewport`'s `renderLeaf` fallback - a colored
box with the region name), not as content.

This is the honest, expected shape of the topology/binding split at this
point in the epic, not a doctrine violation or a bug: `renderLeaf`'s
placeholder is the existing, sanctioned fallback for exactly this case, and
the invariant from story 1 (`01-overflow-doctrine-and-audit.md`) is still
held - every leaf still clips to its rect, nothing overflows or scrolls. What
it means concretely:

- A freshly-created scene's real player view now shows empty labeled regions
  around its activity content, where before story 3 it showed only
  `mainContent` (single-leaf topology, matching the single-leaf binding).
- This is deferred to story 4 (slot registry - lets an activity author
  multiple bindings) and story 6 (temporal overflow - a leaf can rotate
  through content, so an unbound-but-present region isn't just dead space)
  rather than solved here, matching how `02-kill-the-cutoff.md` deferred
  "which activities assume unbounded height" rather than fixing every
  registry component in the story that first made `V` real.
- **Legacy/pre-existing sessions are unaffected**: they have no `layout`
  field at all, so `FALLBACK_LAYOUT` (single-leaf `mainContent`) still
  applies - only newly-created scenes pick up the multi-region template.

## What every downstream story can assume

- `SceneConfig.layout` is the only place topology lives. If you find yourself
  hardcoding a tree or dispatching on `scene_name` to pick one, that's a new
  fork - route it through the scene's own `layout` instead.
- The shell/scene nesting is a recorded decision, not yet code. Story 5 is
  where an outer shell tree with a `content` slot actually gets built; until
  then, chrome stays bespoke and `SceneConfig.layout` describes only a
  scene's own content region.
- `LAYOUT_TEMPLATES`/`dramaTree`/`studyTree`/`topikTree`/`voiceTree` are
  seeds, consulted once at scene-creation time
  (`to-scene-config.ts`). No renderer should import them directly to decide
  what's on screen right now - that's what produced the three forks this
  story retired.
- An unbound leaf rendering as a colored placeholder box is expected,
  sanctioned behavior for a scene whose binding hasn't caught up to its
  topology yet - not a regression to chase down outside of stories 4/6.
