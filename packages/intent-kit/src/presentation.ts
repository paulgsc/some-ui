/**
 * Only the enum: what each mode permits and how it renders live in
 * `apps/www/src/lib/intent/presentation.ts`, which knows the design system.
 *
 * Three values, not two. A debounced autosave was not asked for, so
 * interrupting is wrong, but a silent failure loses work the person just
 * authored. `"ambient-durable"` names that case: progress may be quiet, but
 * a failure must survive the tab.

 */
export type IntentPresentation = "interactive" | "ambient" | "ambient-durable"
