/*
 * Design tokens for every qoder-context view. Use these instead of literal values.
 *
 * Host palette — packaged Qoder hashes its CSS variable names, so host.tsx copies the computed text
 * and background colours onto the root as --qc-text / --qc-surface and sets data-qc-scheme to
 * "light" or "dark". Everything below is derived from those two colours.
 *
 * Spacing   --qc-space-{1,2,3,4,5,6,8}   4 8 12 16 20 24 32px
 * Radii     --qc-radius-{sm,md,lg,pill}  6 8 12 999px
 * Type      --qc-font-{xs,sm,md,lg,xl,2xl} 11 12 13 15 18 22px; --qc-weight-{medium,bold} 500 600
 * Text      --qc-text (primary), --qc-text-2 (secondary), --qc-text-3 (muted)
 * Surfaces  --qc-card (card fill), --qc-fill / --qc-fill-2 (tracks, hovers), --qc-border / --qc-border-strong
 * Elevation --qc-shadow-1 (resting card), --qc-shadow-2 (hover/raised); flatter in dark
 * Semantic  --qc-accent, --qc-success, --qc-warning, --qc-danger, each with a -soft tint for
 *           backgrounds. Hues are nudged towards --qc-text so they keep contrast in both schemes.
 * Series    --qc-cached, --qc-uncached, --qc-output (token kinds), --qc-heat (heatmap), --qc-read (file reads, tally bars),
 *           --qc-time-model / --qc-time-tool (timing; compaction time uses --qc-warning), --qc-credits (+ -ink for text),
 *           --qc-search (search hits), --qc-comp-* (context composition parts)
 * Charts    .qc-chart (focusable chart surface), .qc-axis / .qc-grid-line, .qc-band (hover column),
 *           data-active on the hovered item; tooltips via useChartTip + Tooltip + TipBody (tooltip.tsx)
 * Motion    --qc-dur-{fast,base,slow,number} 120 200 360 600ms; --qc-ease-out, --qc-ease-spring
 *           Classes: .qc-enter (fade + rise on mount, stagger with --qc-i), .qc-grow-y (SVG bars
 *           grow from their base), .qc-fill-in (meters sweep in from the left), .qc-pressable
 *           (hover lift + press). Numbers ease via AnimatedNumber/useTweenedNumber (motion.ts).
 *           Animate transform and opacity only (the tooltip glides with \`translate\`; the Segmented
 *           thumb takes its new size at once and slides from its old box with a Web Animation), so motion
 *           stays on the compositor. All motion is dropped under prefers-reduced-motion, except
 *           the busy spinner. Session tiles use content-visibility, so offscreen ones skip rendering.
 * Layout    .qc-grid + .qc-kpis (.qc-kpis-8: 2, 4 or 8 across) / .qc-two / .qc-split (3:2) / .qc-four; components in ui.tsx (Card, SectionHeader,
 *           Kpi, Skeleton, Spinner, Segmented, Collapse, CappedList, EmptyState, Icon). The session
 *           view adds .qc-pairs (at most two columns), .qc-hero (ContextRing card + KPIs),
 *           .qc-timeline (events), .qc-row (static tally rows), .qc-pin-strip (pinned trend request),
 *           .qc-timing-* / .qc-ribbon (timing card) and .qc-runs (command executions: rail + run list). host.tsx tags the root
 *           data-qc-width="narrow" (<520px) / "regular" / "wide" (>=1200px) for width-specific rules;
 *           cards use --qc-card-pad for their side padding. Search matches render as .qc-mark.
 * A11y      Every focusable element gets a 2px --qc-accent focus ring (lists draw theirs inset);
 *           small semantic text uses the --qc-*-ink variants, which keep 4.5:1 on cards.
 * Per view  Rules between an "@view insights" (or "@view session") marker comment and an "@end" one
 *           ship only in that view's bundle (scripts/build.mjs strips them from the other).
 */
export const STYLES = `
.qc-root {
  --qc-text: CanvasText;
  --qc-surface: Canvas;

  --qc-space-1: 4px;
  --qc-space-2: 8px;
  --qc-space-3: 12px;
  --qc-space-4: 16px;
  --qc-space-5: 20px;
  --qc-space-6: 24px;
  --qc-space-8: 32px;

  --qc-radius-sm: 6px;
  --qc-radius-md: 8px;
  --qc-radius-lg: 12px;
  --qc-radius-pill: 999px;

  --qc-font-xs: 11px;
  --qc-font-sm: 12px;
  --qc-font-md: 13px;
  --qc-font-lg: 15px;
  --qc-font-xl: 18px;
  --qc-font-2xl: 22px;
  --qc-weight-medium: 500;
  --qc-weight-bold: 600;

  --qc-text-2: color-mix(in srgb, var(--qc-text) 70%, transparent);
  /* 60% keeps muted text above 4.5:1 on cards in both schemes. */
  --qc-text-3: color-mix(in srgb, var(--qc-text) 60%, transparent);
  --qc-border: color-mix(in srgb, var(--qc-text) 10%, transparent);
  --qc-border-strong: color-mix(in srgb, var(--qc-text) 18%, transparent);
  --qc-fill: color-mix(in srgb, var(--qc-text) 4%, transparent);
  --qc-fill-2: color-mix(in srgb, var(--qc-text) 8%, transparent);
  --qc-fill-3: color-mix(in srgb, var(--qc-text) 13%, transparent);
  --qc-card: color-mix(in srgb, var(--qc-surface) 97%, var(--qc-text));
  --qc-raised: var(--qc-surface);

  --qc-accent: color-mix(in oklab, #5b7cf7 88%, var(--qc-text));
  --qc-success: color-mix(in oklab, #2bb3a3 88%, var(--qc-text));
  --qc-warning: color-mix(in oklab, #e0a020 90%, var(--qc-text));
  --qc-danger: color-mix(in oklab, #e5484d 90%, var(--qc-text));
  --qc-accent-soft: color-mix(in srgb, var(--qc-accent) 14%, transparent);
  --qc-success-soft: color-mix(in srgb, var(--qc-success) 14%, transparent);
  --qc-warning-soft: color-mix(in srgb, var(--qc-warning) 16%, transparent);
  --qc-danger-soft: color-mix(in srgb, var(--qc-danger) 14%, transparent);
  /* Semantic colours for small text: pulled further towards --qc-text for contrast. */
  --qc-success-ink: color-mix(in oklab, var(--qc-success) 72%, var(--qc-text));
  --qc-warning-ink: color-mix(in oklab, var(--qc-warning) 62%, var(--qc-text));
  --qc-danger-ink: color-mix(in oklab, var(--qc-danger) 78%, var(--qc-text));
  --qc-accent-ink: color-mix(in oklab, var(--qc-accent) 82%, var(--qc-text));

  --qc-cached: var(--qc-success);
  --qc-uncached: var(--qc-accent);
  --qc-output: color-mix(in oklab, #f0a04b 90%, var(--qc-text));
  --qc-heat: var(--qc-success);
  --qc-read: color-mix(in srgb, var(--qc-accent) 50%, transparent);
  --qc-time-model: color-mix(in oklab, #8b6cf0 88%, var(--qc-text));
  --qc-time-tool: color-mix(in oklab, #2a9fd0 88%, var(--qc-text));
  --qc-credits: color-mix(in oklab, #c45fd6 86%, var(--qc-text));
  --qc-credits-ink: color-mix(in oklab, var(--qc-credits) 75%, var(--qc-text));
  --qc-search: color-mix(in srgb, var(--qc-time-tool) 55%, transparent);
  --qc-comp-system: color-mix(in srgb, var(--qc-text) 34%, transparent);
  --qc-comp-tools: color-mix(in srgb, var(--qc-text) 20%, transparent);
  --qc-comp-skills: var(--qc-time-model);
  --qc-comp-user: var(--qc-accent);
  --qc-comp-injected: color-mix(in oklab, #e0609a 86%, var(--qc-text));
  --qc-comp-tool-calls: var(--qc-time-tool);
  --qc-comp-reasoning: color-mix(in oklab, #7fb83a 86%, var(--qc-text));
  --qc-comp-answers: var(--qc-output);
  /* Legacy aliases. */
  --qc-primary: var(--qc-accent);
  --qc-error: var(--qc-danger);

  --qc-shadow-1: 0 1px 2px rgb(0 0 0 / 0.05), 0 1px 1px rgb(0 0 0 / 0.03);
  --qc-shadow-2: 0 6px 16px -4px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.05);

  --qc-dur-fast: 120ms;
  --qc-dur-base: 200ms;
  --qc-dur-slow: 360ms;
  --qc-dur-number: 600ms;
  --qc-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --qc-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);

  box-sizing: border-box;
  color: var(--qc-text);
  font-size: var(--qc-font-md);
  line-height: 1.5;
  --qc-pad-top: var(--qc-space-5);
  padding: var(--qc-pad-top) var(--qc-space-6) var(--qc-space-8);
  min-width: 0;
  height: 100%;
  overflow: auto;
  -webkit-font-smoothing: antialiased;
}
.qc-root[data-qc-scheme="dark"] {
  --qc-card: color-mix(in srgb, var(--qc-surface) 94%, var(--qc-text));
  --qc-raised: color-mix(in srgb, var(--qc-surface) 90%, var(--qc-text));
  --qc-border: color-mix(in srgb, var(--qc-text) 9%, transparent);
  --qc-accent-soft: color-mix(in srgb, var(--qc-accent) 20%, transparent);
  --qc-success-soft: color-mix(in srgb, var(--qc-success) 20%, transparent);
  --qc-warning-soft: color-mix(in srgb, var(--qc-warning) 20%, transparent);
  --qc-danger-soft: color-mix(in srgb, var(--qc-danger) 20%, transparent);
  --qc-shadow-1: none;
  --qc-shadow-2: 0 8px 20px -6px rgb(0 0 0 / 0.5);
}
.qc-root *, .qc-root *::before, .qc-root *::after { box-sizing: border-box; }
.qc-root.qc-compact { --qc-pad-top: var(--qc-space-3); padding: var(--qc-pad-top) var(--qc-space-3) var(--qc-space-6); }
.qc-root :where(button, a, summary, [role="button"], [tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid var(--qc-accent); outline-offset: 1px; }
/* These draw their own inset or shadow ring. */
.qc-root :is(.qc-tally .qc-row, .qc-timeline li, .qc-run, .qc-donut-legend li, .qc-fact, .qc-rate):focus-visible { outline: none; }
.qc-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

/* Page header */
.qc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--qc-space-3); flex-wrap: wrap; margin-bottom: var(--qc-space-4); }
.qc-head h1 { font-size: var(--qc-font-xl); font-weight: var(--qc-weight-bold); letter-spacing: -0.01em; line-height: 1.3; margin: 0; }
.qc-head p { margin: 2px 0 0; color: var(--qc-text-2); }
.qc-compact .qc-head { margin-bottom: var(--qc-space-3); }
.qc-compact .qc-head h1 { font-size: var(--qc-font-lg); }
.qc-actions { display: flex; align-items: center; gap: var(--qc-space-2); flex-wrap: wrap; }
.qc-button-label { display: inline-flex; align-items: center; gap: 6px; }

/* Segmented control */
.qc-segment { position: relative; isolation: isolate; display: inline-flex; padding: 2px; border-radius: var(--qc-radius-md); background: var(--qc-fill-2); }
.qc-segment button { position: relative; z-index: 1; border: 0; background: transparent; color: var(--qc-text-2); padding: 3px 10px; border-radius: var(--qc-radius-sm); font: inherit; font-size: var(--qc-font-sm); white-space: nowrap; cursor: pointer; transition: color var(--qc-dur-base) var(--qc-ease-out), transform var(--qc-dur-fast) var(--qc-ease-out); }
.qc-segment button:hover, .qc-segment button[aria-checked="true"] { color: var(--qc-text); }
.qc-segment button:active { transform: scale(0.96); }
.qc-segment-thumb { position: absolute; left: 0; top: 0; z-index: 0; width: 0; height: 0; transform-origin: 0 0; border-radius: var(--qc-radius-sm); background: var(--qc-raised); box-shadow: var(--qc-shadow-1), 0 0 0 1px var(--qc-border); opacity: 0; pointer-events: none; }
.qc-segment[data-measured] .qc-segment-thumb { opacity: 1; }
.qc-root[data-qc-scheme="dark"] .qc-segment-thumb { background: color-mix(in srgb, var(--qc-text) 16%, var(--qc-card)); box-shadow: 0 0 0 1px var(--qc-border-strong); }
.qc-segment:not([data-measured]) button[aria-checked="true"] { background: var(--qc-raised); box-shadow: var(--qc-shadow-1), 0 0 0 1px var(--qc-border); }

/* Layout */
.qc-grid { display: grid; gap: var(--qc-space-3); margin-bottom: var(--qc-space-3); min-width: 0; }
.qc-kpis { grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); }
.qc-compact .qc-kpis { grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: var(--qc-space-2); }
.qc-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); }
.qc-pairs { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(320px, calc(50% - 6px))), 1fr)); }
.qc-four { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.qc-kpis-8 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.qc-split { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
.qc-stack-gap { margin-bottom: var(--qc-space-3); }

/* Card + section header */
.qc-card { --qc-card-pad: var(--qc-space-4); border: 1px solid var(--qc-border); border-radius: var(--qc-radius-lg); padding: 14px var(--qc-card-pad); min-width: 0; background: var(--qc-card); box-shadow: var(--qc-shadow-1); }
.qc-section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--qc-space-2); margin: 0 0 var(--qc-space-3); min-width: 0; }
.qc-section-head h2 { font-size: var(--qc-font-md); font-weight: var(--qc-weight-bold); margin: 0; line-height: 1.4; }
.qc-section-hint { color: var(--qc-text-3); font-size: var(--qc-font-sm); font-variant-numeric: tabular-nums; min-width: 0; }
.qc-section-aside { margin-left: auto; display: flex; align-items: center; gap: var(--qc-space-2); }
.qc-badge { display: inline-flex; align-items: center; min-width: 20px; justify-content: center; padding: 0 6px; border-radius: var(--qc-radius-pill); background: var(--qc-fill-2); color: var(--qc-text-2); font-size: var(--qc-font-xs); font-weight: var(--qc-weight-medium); line-height: 18px; font-variant-numeric: tabular-nums; }

/* KPI tiles */
.qc-kpi { padding: var(--qc-space-3) 14px; display: flex; flex-direction: column; gap: 2px; position: relative; overflow: hidden; transition: border-color var(--qc-dur-base) var(--qc-ease-out); }
.qc-kpi:hover { border-color: var(--qc-border-strong); }
.qc-kpi::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 2px; border-radius: 0 2px 2px 0; background: var(--qc-tone, transparent); }
.qc-kpi[data-tone="accent"] { --qc-tone: var(--qc-accent); }
.qc-kpi[data-tone="success"] { --qc-tone: var(--qc-success); }
.qc-kpi[data-tone="warning"] { --qc-tone: var(--qc-warning); }
.qc-kpi[data-tone="danger"] { --qc-tone: var(--qc-danger); }
.qc-kpi[data-tone="credits"] { --qc-tone: var(--qc-credits); }
.qc-credits-ink { color: var(--qc-credits-ink); }
.qc-kpi-label { color: var(--qc-text-2); font-size: var(--qc-font-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-kpi-value { font-size: var(--qc-font-2xl); font-weight: var(--qc-weight-bold); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.2; }
.qc-compact .qc-kpi { padding: 10px var(--qc-space-3); }
.qc-compact .qc-kpi-value { font-size: var(--qc-font-xl); }
.qc-kpi-sub { color: var(--qc-text-3); font-size: var(--qc-font-sm); }
.qc-kpi[data-tone="danger"] .qc-kpi-sub { color: var(--qc-danger-ink); }
.qc-kpi[data-tone="warning"] .qc-kpi-sub { color: var(--qc-warning-ink); }
.qc-kpi-skeleton { gap: var(--qc-space-2); box-shadow: none; }

.qc-muted { color: var(--qc-text-3); }
.qc-note { color: var(--qc-text-3); font-size: var(--qc-font-sm); margin: var(--qc-space-1) 0 var(--qc-space-3); }

/* Charts */
.qc-svg { display: block; width: 100%; height: auto; overflow: visible; }
.qc-svg text, .qc-trend text, .qc-trend-axis text { fill: var(--qc-text-3); font-size: 10px; font-variant-numeric: tabular-nums; }
.qc-svg.qc-week text { font-size: var(--qc-font-xs); }
.qc-chart { outline: none; }
.qc-chart:focus-visible { outline: 2px solid var(--qc-accent); outline-offset: 4px; border-radius: var(--qc-radius-sm); }
.qc-axis { stroke: var(--qc-border-strong); }
.qc-grid-line { stroke: var(--qc-border); stroke-dasharray: 2 3; }
.qc-band { fill: var(--qc-fill-2); opacity: 0; transition: opacity var(--qc-dur-fast) var(--qc-ease-out); }
g[data-active] > .qc-band, .qc-trend-band { opacity: 1; }
.qc-trend-band { fill: var(--qc-fill-3); transition: translate var(--qc-dur-fast) var(--qc-ease-out); }
.qc-bar { transition: fill-opacity var(--qc-dur-base) var(--qc-ease-out); }
.qc-chart:has(g[data-active]) .qc-bar { fill-opacity: 0.45; }
.qc-chart g[data-active] .qc-bar { fill-opacity: 1; }
.qc-svg text.qc-value { fill: var(--qc-text-2); font-weight: var(--qc-weight-medium); }
.qc-chart g[data-active] text, .qc-root text.qc-today { fill: var(--qc-text); font-weight: var(--qc-weight-bold); }
.qc-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: var(--qc-space-2); color: var(--qc-text-2); font-size: var(--qc-font-sm); }
.qc-legend span { display: inline-flex; align-items: center; gap: 6px; }
.qc-legend-inline { margin: 0; font-size: var(--qc-font-xs); gap: 4px 10px; }
.qc-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex: none; }
.qc-swatch-window { width: 12px; height: 2px; border-radius: 0; background: repeating-linear-gradient(90deg, var(--qc-text-3) 0 2px, transparent 2px 4px); }
.qc-swatch-rule { width: 2px; height: 11px; border-radius: 0; background: repeating-linear-gradient(var(--qc-warning) 0 3px, transparent 3px 5px); }

/* @view insights */
.qc-week-card { display: flex; flex-direction: column; }
.qc-week-card > .qc-tip-host { margin-top: auto; }
.qc-week-legend { justify-content: flex-end; margin-top: var(--qc-space-1); }
.qc-ago { font-size: var(--qc-font-xs); }
.qc-root[data-qc-width="narrow"] .qc-ago { display: none; }
/* Donut */
.qc-donut { display: flex; align-items: center; gap: var(--qc-space-4); }
.qc-donut svg { width: 104px; height: 104px; flex: none; overflow: visible; }
.qc-donut-seg { transition: stroke-dasharray var(--qc-dur-slow) var(--qc-ease-out), stroke-dashoffset var(--qc-dur-slow) var(--qc-ease-out), stroke-width var(--qc-dur-base) var(--qc-ease-spring), opacity var(--qc-dur-base) var(--qc-ease-out); }
.qc-donut[data-active] .qc-donut-seg { opacity: 0.35; }
.qc-donut[data-active] .qc-donut-seg[data-active] { opacity: 1; stroke-width: 17; }
.qc-donut-value { font-size: var(--qc-font-md); fill: var(--qc-text); font-weight: var(--qc-weight-bold); font-variant-numeric: tabular-nums; }
.qc-donut-caption { font-size: 9px; fill: var(--qc-text-3); font-variant-numeric: tabular-nums; }
.qc-donut-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; font-size: var(--qc-font-sm); }
.qc-donut-wrap { container-type: inline-size; }
.qc-donut-legend li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; column-gap: var(--qc-space-2); align-items: center; padding: 2px 6px; margin: 0 -6px; border-radius: var(--qc-radius-sm); outline: none; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-donut-legend li[data-active] { background: var(--qc-fill); }
.qc-donut-legend li:focus-visible { box-shadow: inset 0 0 0 2px var(--qc-accent); }
.qc-donut-tokens { color: var(--qc-text-3); font-variant-numeric: tabular-nums; }
.qc-donut-pct { min-width: 3.2ch; text-align: right; color: var(--qc-text); font-weight: var(--qc-weight-medium); font-variant-numeric: tabular-nums; }
@container (max-width: 340px) {
  .qc-donut { flex-direction: column; align-items: stretch; gap: var(--qc-space-3); }
  .qc-donut svg { align-self: center; }
}
@container (max-width: 180px) { .qc-donut-tokens { display: none; } }

/* Heatmap */
.qc-heat-cell { cursor: pointer; stroke: transparent; stroke-width: 1.5; transition: fill-opacity var(--qc-dur-fast) var(--qc-ease-out), stroke var(--qc-dur-fast) var(--qc-ease-out); }
.qc-heat-cell[data-today] { stroke: var(--qc-border-strong); }
.qc-heat-cell[data-active] { stroke: var(--qc-text-2); }
.qc-heat-cell[data-selected] { stroke: var(--qc-text); }
.qc-heat-legend { display: flex; align-items: center; justify-content: flex-end; gap: 3px; margin-top: var(--qc-space-2); color: var(--qc-text-3); font-size: var(--qc-font-xs); }
.qc-heat-legend span { margin: 0 3px; }
.qc-heat-legend .qc-swatch { width: 10px; height: 10px; }
.qc-donut > svg { animation: qc-spin-in var(--qc-dur-slow) var(--qc-ease-out) backwards; }
/* @end */

/* @view session */
/* Per-request trend */
.qc-trend-wrap { display: flex; align-items: flex-start; }
.qc-trend-wrap .qc-scroll { flex: 1; min-width: 0; }
.qc-trend { display: block; overflow: visible; }
.qc-trend.qc-chart:focus-visible { outline-offset: -2px; }
.qc-trend-axis { flex: none; display: block; overflow: visible; }
.qc-window { stroke: var(--qc-text-3); stroke-dasharray: 2 3; pointer-events: none; }
.qc-trend-axis text.qc-window-label { fill: var(--qc-text); font-weight: var(--qc-weight-bold); }
.qc-bars { transition: opacity var(--qc-dur-base) var(--qc-ease-out); }
.qc-bars[data-dim] { opacity: 0.4; }
.qc-bars-active { pointer-events: none; }
.qc-compaction line { stroke: var(--qc-warning); stroke-dasharray: 4 3; stroke-width: 1.5; }
.qc-compaction circle { fill: var(--qc-raised); stroke: var(--qc-warning); stroke-width: 1.5; }
.qc-trend .qc-compaction text { fill: var(--qc-warning); font-size: 9px; }
.qc-scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: var(--qc-space-1); }
.qc-trend { cursor: pointer; }
.qc-trend .qc-zero { stroke: var(--qc-text-3); }
.qc-compaction { cursor: pointer; }
.qc-compaction circle { transition: fill var(--qc-dur-fast) var(--qc-ease-out); }
.qc-compaction:hover circle { fill: var(--qc-warning-soft); }
.qc-trend-pin { transition: translate var(--qc-dur-slow) var(--qc-ease-out); }
.qc-trend-pin rect { fill: var(--qc-accent-soft); stroke: var(--qc-accent); stroke-width: 1.5; }
.qc-trend-pin .qc-pin-pulse { fill: none; opacity: 0; transform-box: fill-box; transform-origin: center; animation: qc-pin-pulse 900ms var(--qc-ease-out) 2; }
.qc-pin-strip { margin-top: var(--qc-space-3); padding: var(--qc-space-2) var(--qc-space-3); border-radius: var(--qc-radius-md); background: var(--qc-fill); border: 1px solid var(--qc-border); font-size: var(--qc-font-sm); }
.qc-pin-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.qc-pin-head .qc-icon { color: var(--qc-accent); }
.qc-pin-head .qc-muted { font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-pin-close { margin-left: auto; width: 22px; height: 22px; border-color: transparent; background: transparent; }
.qc-pin-facts { display: flex; flex-wrap: wrap; gap: 4px var(--qc-space-5); margin: 6px 0 0; }
.qc-pin-facts > div { display: flex; flex-direction: column; min-width: 0; }
.qc-pin-facts dt { display: inline-flex; align-items: center; gap: 6px; color: var(--qc-text-3); font-size: var(--qc-font-xs); }
.qc-pin-facts dd { margin: 0; font-weight: var(--qc-weight-medium); font-variant-numeric: tabular-nums; white-space: nowrap; }
.qc-pin-tools dd { white-space: normal; overflow-wrap: anywhere; }
.qc-pin-delta { margin-left: 6px; padding: 0 5px; border-radius: var(--qc-radius-pill); font-size: var(--qc-font-xs); background: var(--qc-accent-soft); color: var(--qc-text); }
.qc-pin-delta[data-sign="down"] { background: var(--qc-success-soft); }
.qc-pin-strip .qc-tip-warn { margin-top: 6px; }
.qc-pin-head strong { min-width: 0; }
.qc-pin-head .qc-muted { flex: none; }
.qc-brief { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px var(--qc-space-3); margin: var(--qc-space-2) 0 0; padding-top: var(--qc-space-2); border-top: 1px solid var(--qc-border); }
.qc-brief > div { display: contents; }
.qc-brief dt { color: var(--qc-text-3); font-size: var(--qc-font-xs); line-height: 18px; }
.qc-brief dd { margin: 0; min-width: 0; color: var(--qc-text-2); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qc-brief-quote { color: var(--qc-text); }

/* @end */

/* Chart tooltip */
.qc-tip-host { position: relative; min-width: 0; }
.qc-tip { position: absolute; left: 0; top: 0; z-index: 10; pointer-events: none; min-width: 150px; max-width: 300px; padding: var(--qc-space-2) 10px; border-radius: var(--qc-radius-md); background: var(--qc-raised); border: 1px solid var(--qc-border-strong); box-shadow: var(--qc-shadow-2); color: var(--qc-text); font-size: var(--qc-font-sm); line-height: 1.45; visibility: hidden; opacity: 0; transform: translateY(4px) scale(0.97); transform-origin: 50% 100%; transition: opacity var(--qc-dur-fast) var(--qc-ease-out), transform var(--qc-dur-base) var(--qc-ease-out), visibility 0s linear var(--qc-dur-fast); }
.qc-tip[data-below] { transform-origin: 50% 0; transform: translateY(-4px) scale(0.97); }
.qc-tip[data-open] { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }
.qc-tip[data-open][data-glide] { transition: opacity var(--qc-dur-fast) var(--qc-ease-out), transform var(--qc-dur-base) var(--qc-ease-out), translate var(--qc-dur-base) var(--qc-ease-out); }
.qc-root[data-qc-scheme="dark"] .qc-tip { box-shadow: 0 10px 28px -8px rgb(0 0 0 / 0.6); }
.qc-tip-title { font-weight: var(--qc-weight-bold); margin-bottom: var(--qc-space-1); white-space: nowrap; }
.qc-tip-rows { margin: 0; display: grid; gap: 2px; }
.qc-tip-rows div { display: flex; justify-content: space-between; gap: var(--qc-space-3); }
.qc-tip-rows dt { display: inline-flex; align-items: center; gap: 6px; color: var(--qc-text-2); }
.qc-tip-rows dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: var(--qc-weight-medium); }
.qc-tip-note { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--qc-border); color: var(--qc-text-3); overflow-wrap: anywhere; }
.qc-tip-note:empty { display: none; }
.qc-tip-rows + .qc-tip-note, .qc-tip-title + .qc-tip-note { margin-top: 6px; }
.qc-tip-path { color: var(--qc-text-2); margin-bottom: 2px; }
.qc-sessions-card .qc-tip-title, .qc-tally-host .qc-tip-title { white-space: normal; overflow-wrap: anywhere; }
.qc-tip-warn { color: var(--qc-warning-ink); font-weight: var(--qc-weight-medium); }
.qc-tip-hint { color: var(--qc-accent-ink); margin-top: 2px; }
.qc-tip-code, .qc-run-command, .qc-attention code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
.qc-tip .qc-tip-title:has(.qc-tip-code) { white-space: normal; overflow-wrap: anywhere; font-weight: var(--qc-weight-medium); }

/* Tallies */
.qc-row-dir { color: var(--qc-text-3); font-size: var(--qc-font-xs); }
.qc-tally { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.qc-tally :is(button, .qc-row) { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px var(--qc-space-2); align-items: center; border: 0; background: transparent; color: inherit; font: inherit; padding: 4px 6px 5px; margin: 0; border-radius: var(--qc-radius-sm); cursor: pointer; text-align: left; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-tally :is(button, .qc-row):hover { background: var(--qc-fill); }
.qc-tally .qc-row { outline: none; cursor: default; }
.qc-tally .qc-row:focus-visible { box-shadow: inset 0 0 0 2px var(--qc-accent); }
.qc-tally button[aria-pressed="true"] { background: var(--qc-accent-soft); }
.qc-tally-bar { grid-column: 1 / -1; display: block; height: 3px; border-radius: var(--qc-radius-pill); background: var(--qc-fill); overflow: hidden; }
.qc-tally-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--qc-read); transform-origin: left; transition: width var(--qc-dur-slow) var(--qc-ease-out), background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-tally :is(button, .qc-row):is(:hover, :focus-visible) .qc-tally-bar > span:last-child, .qc-tally button[aria-pressed="true"] .qc-tally-bar > span { background: var(--qc-accent); }
.qc-tally button[aria-pressed="true"] .qc-count { color: var(--qc-text); font-weight: var(--qc-weight-medium); }
.qc-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows var(--qc-dur-slow) var(--qc-ease-out), opacity var(--qc-dur-base) var(--qc-ease-out); }
.qc-collapse[data-open] { grid-template-rows: 1fr; opacity: 1; }
.qc-collapse > div { min-height: 0; overflow: hidden; }
.qc-collapse > div > .qc-tally { padding-top: 2px; }
.qc-more { display: inline-flex; align-items: center; gap: var(--qc-space-1); margin: 6px 0 0 -2px; padding: 2px 6px; border: 0; border-radius: var(--qc-radius-sm); background: transparent; color: var(--qc-text-2); font: inherit; font-size: var(--qc-font-sm); cursor: pointer; transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-more:hover:not(:disabled) { background: var(--qc-fill); color: var(--qc-text); }
.qc-more:disabled { opacity: 0.5; cursor: default; }
.qc-more .qc-icon { transition: transform var(--qc-dur-base) var(--qc-ease-out); }
.qc-more[aria-expanded="true"] .qc-icon { transform: rotate(180deg); }
.qc-more-row { display: flex; justify-content: center; margin-top: var(--qc-space-3); }
.qc-more-row .qc-more { margin: 0; padding: var(--qc-space-1) var(--qc-space-3); border-radius: var(--qc-radius-pill); background: var(--qc-fill); }
.qc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-count { color: var(--qc-text-2); font-variant-numeric: tabular-nums; }

/* Session list */
.qc-toolbar { display: flex; gap: var(--qc-space-2); align-items: center; flex-wrap: wrap; margin-bottom: var(--qc-space-3); }
.qc-search { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; min-width: 0; height: 28px; padding: 0 var(--qc-space-1) 0 var(--qc-space-2); border: 1px solid var(--qc-border-strong); border-radius: var(--qc-radius-md); background: var(--qc-raised); color: var(--qc-text-3); transition: border-color var(--qc-dur-base) var(--qc-ease-out), box-shadow var(--qc-dur-base) var(--qc-ease-out), color var(--qc-dur-base) var(--qc-ease-out); }
.qc-search:hover { border-color: color-mix(in srgb, var(--qc-text) 28%, transparent); }
.qc-search:focus-within { border-color: var(--qc-accent); box-shadow: 0 0 0 3px var(--qc-accent-soft); color: var(--qc-text-2); }
.qc-search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: var(--qc-text); font: inherit; }
.qc-search input::placeholder { color: var(--qc-text-3); }
.qc-search-clear { display: inline-grid; place-items: center; flex: none; width: 20px; height: 20px; padding: 0; border: 0; border-radius: var(--qc-radius-pill); background: var(--qc-fill-2); color: var(--qc-text-2); cursor: pointer; animation: qc-pop var(--qc-dur-base) var(--qc-ease-spring) backwards; transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-search-clear:hover { background: var(--qc-fill-3); color: var(--qc-text); }
.qc-mark { background: color-mix(in srgb, var(--qc-warning) 32%, transparent); color: inherit; border-radius: 2px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--qc-warning) 32%, transparent); }
.qc-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; padding: 2px 4px 2px 10px; border-radius: var(--qc-radius-pill); background: var(--qc-accent-soft); color: var(--qc-text); font-size: var(--qc-font-sm); animation: qc-pop var(--qc-dur-base) var(--qc-ease-spring) backwards; }
.qc-chip button { display: inline-grid; place-items: center; width: 20px; height: 20px; flex: none; border: 0; background: transparent; color: var(--qc-text-2); cursor: pointer; font: inherit; padding: 0; border-radius: var(--qc-radius-pill); transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-chip button:hover { background: var(--qc-fill-2); color: var(--qc-text); }
/* @view insights */
.qc-group + .qc-group { margin-top: var(--qc-space-4); }
.qc-group-head { position: sticky; top: calc(-1 * var(--qc-pad-top)); z-index: 2; display: flex; align-items: center; gap: var(--qc-space-2); margin: 0 calc(-1 * var(--qc-card-pad)) var(--qc-space-2); padding: 6px var(--qc-card-pad); background: var(--qc-card); font-size: var(--qc-font-sm); color: var(--qc-text-2); }
.qc-group-title { font-weight: var(--qc-weight-bold); color: var(--qc-text); }
.qc-group-tokens { margin-left: auto; color: var(--qc-text-3); font-variant-numeric: tabular-nums; }
.qc-sessions { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 10px; }
.qc-session { border: 1px solid var(--qc-border); border-radius: var(--qc-radius-md); padding: 10px var(--qc-space-3); background: var(--qc-raised); text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; display: flex; flex-direction: column; gap: 6px; content-visibility: auto; contain-intrinsic-size: auto 92px; }
.qc-session-title { font-weight: var(--qc-weight-bold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-path { color: var(--qc-text-3); font-size: var(--qc-font-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-meta [data-tone="warning"] { color: var(--qc-warning-ink); }
.qc-session-meta [data-tone="danger"] { color: var(--qc-danger-ink); }
.qc-session-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px var(--qc-space-2); color: var(--qc-text-2); font-size: var(--qc-font-sm); font-variant-numeric: tabular-nums; }
.qc-session-context { display: inline-flex; align-items: center; gap: 4px; }
.qc-mini-ring { flex: none; }
.qc-mini-ring circle { fill: none; stroke: var(--qc-fill-3); }
.qc-mini-ring circle + circle { stroke: var(--qc-accent); stroke-linecap: round; }
.qc-mini-ring[data-tone="warning"] circle + circle { stroke: var(--qc-warning); }
.qc-mini-ring[data-tone="danger"] circle + circle { stroke: var(--qc-danger); }
.qc-group-head .qc-icon { color: var(--qc-text-3); }
.qc-group-title.qc-name { min-width: 0; }
/* @end */

/* Stacked meters */
.qc-meter { display: block; height: 6px; border-radius: var(--qc-radius-pill); overflow: hidden; background: var(--qc-fill-2); }
.qc-meter-fill { display: flex; height: 100%; }
.qc-meter-fill > span { display: block; height: 100%; transition: width var(--qc-dur-slow) var(--qc-ease-out); }
.qc-meter-fill > span + span { box-shadow: -1px 0 0 var(--qc-card); }
.qc-meter-lg { height: 14px; border-radius: var(--qc-radius-sm); margin: var(--qc-space-2) 0 6px; }

.qc-error { color: var(--qc-danger-ink); font-size: var(--qc-font-sm); }
.qc-empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--qc-space-1); padding: var(--qc-space-8) var(--qc-space-4); text-align: center; color: var(--qc-text-3); font-size: var(--qc-font-sm); animation: qc-fade var(--qc-dur-slow) var(--qc-ease-out) backwards; }
.qc-empty-state[data-compact] { padding: var(--qc-space-4) var(--qc-space-2); }
.qc-empty-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: var(--qc-space-1); border-radius: 50%; background: var(--qc-fill-2); color: var(--qc-text-2); }
.qc-empty-state[data-compact] .qc-empty-icon { width: 32px; height: 32px; }
.qc-empty-title { color: var(--qc-text-2); font-size: var(--qc-font-md); font-weight: var(--qc-weight-medium); }
.qc-empty-hint { max-width: 30ch; }
.qc-empty-action { margin-top: var(--qc-space-2); }
.qc-icon { display: block; flex: none; }

/* @view session */
/* Session view: header facts, live status, refresh */
.qc-head-text { flex: 1 1 200px; min-width: 0; }
.qc-session-head h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-facts { display: flex; flex-wrap: wrap; gap: var(--qc-space-1); margin-top: 6px; }
.qc-fact { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; padding: 1px var(--qc-space-2) 1px 6px; border-radius: var(--qc-radius-pill); background: var(--qc-fill); border: 1px solid var(--qc-border); color: var(--qc-text-2); font-size: var(--qc-font-xs); line-height: 18px; outline: none; cursor: default; transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-fact:hover, .qc-fact:focus-visible { background: var(--qc-fill-2); color: var(--qc-text); }
.qc-fact:focus-visible { box-shadow: 0 0 0 2px var(--qc-accent); }
.qc-fact .qc-icon { color: var(--qc-text-3); }
.qc-live { display: inline-flex; align-items: center; gap: 6px; color: var(--qc-text-3); font-size: var(--qc-font-xs); white-space: nowrap; font-variant-numeric: tabular-nums; }
.qc-live i { position: relative; width: 6px; height: 6px; border-radius: 50%; background: var(--qc-success); }
.qc-live i::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: qc-ping 2.4s var(--qc-ease-out) infinite; }
.qc-live[data-state="failed"] { color: var(--qc-danger-ink); }
.qc-live[data-state="failed"] i { background: var(--qc-danger); }
.qc-live[data-state="failed"] i::after { animation: none; }
.qc-icon-button { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--qc-border-strong); border-radius: var(--qc-radius-md); background: var(--qc-raised); color: var(--qc-text-2); cursor: pointer; transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out), transform var(--qc-dur-fast) var(--qc-ease-out); }
.qc-icon-button:hover:not(:disabled) { background: var(--qc-fill-2); color: var(--qc-text); }
.qc-icon-button:active:not(:disabled) { transform: scale(0.94); }
.qc-icon-button:disabled { cursor: default; }
.qc-icon-button[data-busy] .qc-icon { animation: qc-spin 0.9s linear infinite; }

/* Session view: hero (context ring + stats) */
.qc-hero { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); align-items: stretch; }
.qc-root .qc-hero .qc-kpis { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); align-content: start; margin: 0; }
.qc-root[data-qc-width="narrow"] .qc-hero .qc-kpis { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
.qc-root[data-qc-width="wide"] .qc-hero .qc-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: stretch; }
.qc-context-card { container-type: inline-size; }
.qc-context { display: flex; align-items: center; gap: var(--qc-space-5); }
.qc-ring { position: relative; flex: none; width: 132px; height: 132px; }
.qc-ring svg { display: block; width: 100%; height: 100%; overflow: visible; animation: qc-pop var(--qc-dur-slow) var(--qc-ease-out) backwards; }
.qc-ring-track { fill: none; stroke: var(--qc-fill-2); }
.qc-ring-tick { stroke: var(--qc-text-3); stroke-width: 1.5; stroke-linecap: round; }
.qc-ring-tick[data-warn] { stroke: var(--qc-warning); }
.qc-ring-centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
.qc-ring-value { font-size: var(--qc-font-2xl); font-weight: var(--qc-weight-bold); letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; transition: color var(--qc-dur-base) var(--qc-ease-out); }
.qc-ring-caption { color: var(--qc-text-3); font-size: var(--qc-font-xs); max-width: 92px; }
.qc-context[data-tone="warning"] .qc-ring-value { color: var(--qc-warning); }
.qc-context[data-tone="danger"] .qc-ring-value { color: var(--qc-danger); }
.qc-context-stats { flex: 1; min-width: 0; margin: 0; display: grid; gap: 6px; font-size: var(--qc-font-sm); }
.qc-context-stats > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--qc-space-3); }
.qc-context-stats > div:first-child { padding-bottom: 6px; border-bottom: 1px solid var(--qc-border); }
.qc-context-stats dt { display: inline-flex; align-items: center; gap: 6px; color: var(--qc-text-2); white-space: nowrap; }
.qc-context-stats dd { margin: 0; font-weight: var(--qc-weight-medium); font-variant-numeric: tabular-nums; white-space: nowrap; }
.qc-context-stats > div:first-child dd { font-size: var(--qc-font-lg); font-weight: var(--qc-weight-bold); }
.qc-context-stats [data-tone="warning"] dd { color: var(--qc-warning-ink); }
.qc-context-stats [data-tone="danger"] dd { color: var(--qc-danger-ink); }
.qc-context-note { margin: var(--qc-space-3) 0 0; padding: 6px 10px; border-radius: var(--qc-radius-md); background: var(--qc-fill); color: var(--qc-text-2); font-size: var(--qc-font-sm); }
.qc-context-note[data-tone="warning"] { background: var(--qc-warning-soft); color: var(--qc-text); }
.qc-context-note[data-tone="danger"] { background: var(--qc-danger-soft); color: var(--qc-text); }
@container (max-width: 300px) {
  .qc-context { flex-direction: column; align-items: stretch; gap: var(--qc-space-3); }
  .qc-ring { align-self: center; }
}

/* Session view: events timeline */
.qc-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.qc-timeline li { --qc-node: var(--qc-text-2); --qc-node-soft: var(--qc-fill-2); position: relative; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: var(--qc-space-2); padding: 5px 6px 7px; margin: 0 -6px; border-radius: var(--qc-radius-sm); outline: none; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-timeline li:hover, .qc-timeline li[data-qc-tip]:focus-visible { background: var(--qc-fill); }
.qc-timeline li:focus-visible { box-shadow: inset 0 0 0 2px var(--qc-accent); }
.qc-timeline li::before { content: ""; position: absolute; left: 17px; top: 30px; bottom: -6px; width: 1px; background: var(--qc-border-strong); }
.qc-timeline > li:last-child::before { display: none; }
.qc-timeline li[data-tone="warning"] { --qc-node: var(--qc-warning); --qc-node-soft: var(--qc-warning-soft); }
.qc-timeline li[data-tone="danger"] { --qc-node: var(--qc-danger); --qc-node-soft: var(--qc-danger-soft); }
.qc-timeline li[data-tone="accent"] { --qc-node: var(--qc-accent-ink); --qc-node-soft: var(--qc-accent-soft); }
.qc-timeline-title .qc-size { flex: none; font-weight: normal; }
.qc-timeline-node { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--qc-node-soft); color: var(--qc-node); }
.qc-timeline-body { display: flex; flex-direction: column; min-width: 0; gap: 1px; padding-top: 2px; }
.qc-timeline-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: var(--qc-weight-medium); }
.qc-timeline-time { margin-left: auto; flex: none; color: var(--qc-text-3); font-size: var(--qc-font-xs); font-weight: normal; font-variant-numeric: tabular-nums; }
.qc-timeline-detail { color: var(--qc-text-3); font-size: var(--qc-font-sm); font-variant-numeric: tabular-nums; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.qc-collapse > div > .qc-timeline { padding-top: 0; }
.qc-timeline li[data-clickable] { cursor: pointer; }

/* Session view: timing */
.qc-timing-total { display: flex; align-items: baseline; gap: var(--qc-space-2); }
.qc-timing-value { font-size: var(--qc-font-2xl); font-weight: var(--qc-weight-bold); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.qc-timing-parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: var(--qc-font-sm); }
.qc-timing-parts li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto 3.6em; align-items: center; gap: var(--qc-space-2); padding: 2px 0; }
.qc-timing-label { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qc-timing-label .qc-muted { font-size: var(--qc-font-xs); }
.qc-timing-ms { color: var(--qc-text-2); font-variant-numeric: tabular-nums; }
.qc-timing-share { text-align: right; font-weight: var(--qc-weight-medium); font-variant-numeric: tabular-nums; }
.qc-rate { cursor: default; outline: none; }
.qc-rate:focus-visible { box-shadow: 0 0 0 2px var(--qc-accent); }
.qc-ribbon-wrap { margin-top: var(--qc-space-3); }
.qc-ribbon { display: block; width: 100%; height: 22px; border-radius: var(--qc-radius-sm); overflow: hidden; background: var(--qc-fill); }
.qc-ribbon g { transition: opacity var(--qc-dur-fast) var(--qc-ease-out); }
.qc-ribbon[data-active] g:not([data-active]) { opacity: 0.4; }
.qc-ribbon-axis { display: flex; justify-content: space-between; margin-top: 3px; color: var(--qc-text-3); font-size: 10px; font-variant-numeric: tabular-nums; }

/* Session view: command executions */
.qc-runs-card { container-type: inline-size; }
.qc-runs { display: grid; gap: var(--qc-space-4); min-width: 0; }
@container (min-width: 640px) { .qc-runs { grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); } }
.qc-runs-rail, .qc-runs-main { min-width: 0; }
.qc-rail-title { margin: var(--qc-space-3) 0 6px; font-size: var(--qc-font-sm); font-weight: var(--qc-weight-bold); color: var(--qc-text-2); }
.qc-rail-title:first-child { margin-top: 0; }
.qc-mini-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; }
.qc-mini-stats > div { display: flex; flex-direction: column-reverse; justify-content: flex-end; min-width: 0; padding: 6px 10px; border-radius: var(--qc-radius-md); background: var(--qc-fill); border: 1px solid var(--qc-border); }
.qc-mini-stats dd { margin: 0; font-size: var(--qc-font-lg); font-weight: var(--qc-weight-bold); font-variant-numeric: tabular-nums; }
.qc-mini-stats dt { color: var(--qc-text-3); font-size: var(--qc-font-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-mini-stats [data-tone="danger"] dd { color: var(--qc-danger-ink); }
.qc-attention { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.qc-attention button { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--qc-space-2); padding: 4px 6px; border: 0; border-radius: var(--qc-radius-sm); background: transparent; color: inherit; font: inherit; font-size: var(--qc-font-sm); text-align: left; cursor: pointer; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-attention button:hover { background: var(--qc-fill); }
.qc-attention-label { display: inline-flex; align-items: center; gap: 6px; color: var(--qc-text-2); }
.qc-attention-label::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--qc-warning); }
.qc-attention [data-tone="danger"] .qc-attention-label::before { background: var(--qc-danger); }
.qc-attention code { color: var(--qc-text-2); }
.qc-runs-main .qc-toolbar { margin-bottom: var(--qc-space-2); }
.qc-runs-main .qc-search { flex-basis: 160px; }
.qc-run-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.qc-collapse > div > .qc-run-list { padding-top: 1px; }
.qc-run { --qc-status: var(--qc-success); --qc-status-soft: var(--qc-success-soft); display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: var(--qc-space-2); padding: 5px 6px; border-radius: var(--qc-radius-sm); outline: none; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-run:nth-child(even) { background: var(--qc-fill); }
.qc-run:hover { background: var(--qc-fill-2); }
.qc-run:focus-visible { box-shadow: inset 0 0 0 2px var(--qc-accent); }
.qc-run[data-status="failed"] { --qc-status: var(--qc-danger); --qc-status-soft: var(--qc-danger-soft); }
.qc-run[data-status="cancelled"] { --qc-status: var(--qc-text-3); --qc-status-soft: var(--qc-fill-2); }
.qc-run[data-status="background"] { --qc-status: var(--qc-accent); --qc-status-soft: var(--qc-accent-soft); }
.qc-run[data-status="running"] { --qc-status: var(--qc-accent); --qc-status-soft: transparent; }
.qc-run-status { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--qc-status-soft); color: var(--qc-status); }
.qc-run-command { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--qc-text); }
.qc-run[data-status="cancelled"] .qc-run-command { color: var(--qc-text-2); }
.qc-run-meta { display: inline-flex; align-items: center; gap: var(--qc-space-2); font-size: var(--qc-font-xs); color: var(--qc-text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.qc-run-time { min-width: 4.2em; text-align: right; color: var(--qc-text-2); font-variant-numeric: tabular-nums; }
.qc-run-time[data-slow] { color: var(--qc-warning-ink); font-weight: var(--qc-weight-medium); }
.qc-run-clock { color: var(--qc-text-3); font-size: var(--qc-font-xs); font-variant-numeric: tabular-nums; }
.qc-run-link { padding: 0 5px; border: 0; border-radius: var(--qc-radius-pill); background: var(--qc-fill-2); color: var(--qc-text-2); font: inherit; font-size: var(--qc-font-xs); line-height: 18px; cursor: pointer; transition: background-color var(--qc-dur-fast) var(--qc-ease-out), color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-run-link:hover { background: var(--qc-accent-soft); color: var(--qc-text); }
.qc-badge[data-tone="danger"] { background: var(--qc-danger-soft); color: var(--qc-danger-ink); }
.qc-badge[data-tone="accent"] { background: var(--qc-accent-soft); color: var(--qc-text); }
@container (max-width: 460px) {
  .qc-run { grid-template-columns: 18px minmax(0, 1fr); }
  .qc-run-meta { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; }
  .qc-run-time { min-width: 0; text-align: left; }
}

/* Session view: file and tally rows */
.qc-row .qc-count { display: inline-flex; gap: var(--qc-space-2); font-size: var(--qc-font-sm); }
.qc-diff { display: inline-flex; gap: 6px; font-variant-numeric: tabular-nums; font-weight: var(--qc-weight-medium); }
.qc-diff [data-sign="add"] { color: var(--qc-success-ink); }
.qc-diff [data-sign="del"] { color: var(--qc-danger-ink); }
.qc-section-hint .qc-diff { font-size: var(--qc-font-xs); }
.qc-split-bar { display: flex; gap: 1px; }
.qc-swatch-read { background: var(--qc-read); }
.qc-swatch-search, .qc-tally-bar > .qc-bar-search { background: var(--qc-search); }
.qc-file-kind { margin-right: 6px; vertical-align: 1px; }

/* Session view: context composition */
.qc-makeup { margin-top: var(--qc-space-1); }
.qc-card-note { margin: var(--qc-space-2) 0 0; color: var(--qc-text-3); font-size: var(--qc-font-xs); line-height: 1.45; }

/* Session view: subagents */
.qc-fleet { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.qc-collapse > div > .qc-fleet { padding-top: 1px; }
.qc-agent { --qc-status: var(--qc-success); position: relative; display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: var(--qc-space-2); padding: 5px 6px 6px calc(6px + var(--qc-depth, 0) * 18px); border-radius: var(--qc-radius-sm); outline: none; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-agent:hover { background: var(--qc-fill); }
.qc-agent:focus-visible { box-shadow: inset 0 0 0 2px var(--qc-accent); }
.qc-agent::before { content: ""; position: absolute; left: calc(var(--qc-depth, 0) * 18px - 6px); top: 4px; width: 8px; height: 12px; border-left: 1px solid var(--qc-border-strong); border-bottom: 1px solid var(--qc-border-strong); border-bottom-left-radius: 4px; opacity: 0; }
.qc-agent[data-nested]::before { opacity: 1; }
.qc-agent[data-status="failed"] { --qc-status: var(--qc-danger); }
.qc-agent[data-status="stopped"], .qc-agent[data-status="unknown"] { --qc-status: var(--qc-text-3); }
.qc-agent[data-status="running"] { --qc-status: var(--qc-accent); }
.qc-agent-status { display: grid; place-items: center; width: 14px; height: 14px; }
.qc-agent-status i { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--qc-status); }
.qc-agent[data-status="running"] .qc-agent-status i::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: qc-ping 2.4s var(--qc-ease-out) infinite; }
.qc-agent-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.qc-agent-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.qc-agent-title .qc-badge { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-agent-meta { display: inline-flex; align-items: center; gap: var(--qc-space-2); color: var(--qc-text-2); font-size: var(--qc-font-sm); font-variant-numeric: tabular-nums; white-space: nowrap; }
.qc-root[data-qc-width="narrow"] .qc-agent { grid-template-columns: 14px minmax(0, 1fr); }
.qc-root[data-qc-width="narrow"] .qc-agent-meta { grid-column: 2; }
/* @end */

/* Loading */
.qc-skeleton { position: relative; overflow: hidden; border-radius: var(--qc-radius-lg); background: var(--qc-fill-2); }
.qc-skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, var(--qc-fill-2), transparent); animation: qc-shimmer 1.4s ease-in-out infinite; }
.qc-spinner { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--qc-fill-3); border-top-color: currentColor; display: inline-block; animation: qc-spin 0.7s linear infinite; flex: none; }

/* Motion */
.qc-enter { animation: qc-enter var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 35ms); }
.qc-grow-y { transform-box: fill-box; transform-origin: 50% 100%; animation: qc-grow-y var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-fade { animation: qc-fade var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-fill-in { transform-origin: left; animation: qc-fill-in var(--qc-dur-slow) var(--qc-ease-out) backwards; }
.qc-tally-bar > span { animation: qc-grow-x var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-pressable { transition: transform var(--qc-dur-fast) var(--qc-ease-out), box-shadow var(--qc-dur-base) var(--qc-ease-out), border-color var(--qc-dur-base) var(--qc-ease-out), background-color var(--qc-dur-base) var(--qc-ease-out); }
.qc-pressable:hover { transform: translateY(-1px); border-color: var(--qc-border-strong); box-shadow: var(--qc-shadow-2); }
.qc-pressable:active { transform: translateY(0) scale(0.99); box-shadow: var(--qc-shadow-1); transition-duration: 60ms; }
/* Width classes (data-qc-width, set by host.tsx): narrow sidebars to wide editors */
.qc-root[data-qc-width="narrow"]:not(.qc-compact) { --qc-pad-top: var(--qc-space-3); padding: var(--qc-pad-top) var(--qc-space-3) var(--qc-space-6); }
.qc-root[data-qc-width="narrow"] .qc-card { --qc-card-pad: var(--qc-space-3); padding-top: var(--qc-space-3); padding-bottom: var(--qc-space-3); }
.qc-root[data-qc-width="narrow"] .qc-head h1 { font-size: var(--qc-font-lg); }
.qc-root[data-qc-width="narrow"] .qc-head p { font-size: var(--qc-font-sm); }
.qc-root[data-qc-width="narrow"] .qc-actions { width: 100%; }
.qc-root[data-qc-width="narrow"] .qc-range { flex: 1; }
.qc-root[data-qc-width="narrow"] .qc-range button, .qc-root[data-qc-width="narrow"] .qc-toolbar .qc-segment button { flex: 1; }
.qc-root[data-qc-width="narrow"] .qc-kpis { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--qc-space-2); }
.qc-root[data-qc-width="narrow"] .qc-kpis-8 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.qc-root[data-qc-width="narrow"] .qc-kpi { padding: 10px var(--qc-space-3); }
.qc-root[data-qc-width="narrow"] .qc-kpi-value { font-size: var(--qc-font-xl); }
.qc-root[data-qc-width="narrow"] .qc-search { flex-basis: 100%; }
.qc-root[data-qc-width="narrow"] .qc-split { grid-template-columns: minmax(0, 1fr); }
.qc-root[data-qc-width="narrow"] .qc-toolbar .qc-segment { flex: 1; }
.qc-root[data-qc-width="narrow"] .qc-run-filter button { padding-inline: 6px; }
.qc-root[data-qc-width="narrow"] .qc-grid { gap: var(--qc-space-2); margin-bottom: var(--qc-space-2); }
.qc-root[data-qc-width="wide"]:not(.qc-compact) { --qc-pad-top: var(--qc-space-6); padding: var(--qc-pad-top) var(--qc-space-8) 40px; }
.qc-root[data-qc-width="wide"] .qc-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.qc-root[data-qc-width="wide"] .qc-kpis-8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }

@keyframes qc-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes qc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes qc-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes qc-grow-y { from { transform: scaleY(0); } to { transform: none; } }
@keyframes qc-grow-x { from { transform: scaleX(0); } to { transform: none; } }
@keyframes qc-fill-in { from { transform: scaleX(0); } to { transform: none; } }
@keyframes qc-spin-in { from { opacity: 0; transform: rotate(-60deg) scale(0.9); } to { opacity: 1; transform: none; } }
@keyframes qc-shimmer { to { transform: translateX(100%); } }
@keyframes qc-spin { to { transform: rotate(360deg); } }
@keyframes qc-pin-pulse { 0% { opacity: 0.9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.6, 1.08); } }
@keyframes qc-ping { 0% { transform: scale(1); opacity: 0.6; } 70%, 100% { transform: scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .qc-root *, .qc-root *::before, .qc-root *::after { animation: none !important; transition: none !important; }
  .qc-root .qc-spinner, .qc-root .qc-icon-button[data-busy] .qc-icon { animation: qc-spin 1.4s linear infinite !important; }
  .qc-pressable:hover, .qc-pressable:active, .qc-segment button:active { transform: none; }
}
`
