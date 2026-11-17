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
 * Series    --qc-cached, --qc-uncached, --qc-output (token kinds), --qc-heat (heatmap)
 * Charts    .qc-chart (focusable chart surface), .qc-axis / .qc-grid-line, .qc-band (hover column),
 *           data-active on the hovered item; tooltips via useChartTip + Tooltip + TipBody (tooltip.tsx)
 * Motion    --qc-dur-{fast,base,slow,number} 120 200 360 600ms; --qc-ease-out, --qc-ease-spring
 *           Classes: .qc-enter (fade + rise on mount, stagger with --qc-i), .qc-grow-y (SVG bars
 *           grow from their base), .qc-fill-in (meters sweep in from the left), .qc-pressable
 *           (hover lift + press). Numbers ease via AnimatedNumber/useTweenedNumber (motion.ts).
 *           All motion is dropped under prefers-reduced-motion, except the busy spinner.
 * Layout    .qc-grid + .qc-kpis / .qc-two / .qc-four; components in ui.tsx (Card, SectionHeader,
 *           Kpi, Skeleton, Spinner, Segmented, Collapse, EmptyState, Icon). host.tsx tags the root
 *           data-qc-width="narrow" (<520px) / "regular" / "wide" (>=1200px) for width-specific rules;
 *           cards use --qc-card-pad for their side padding. Search matches render as .qc-mark.
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
  --qc-text-3: color-mix(in srgb, var(--qc-text) 48%, transparent);
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

  --qc-cached: var(--qc-success);
  --qc-uncached: var(--qc-accent);
  --qc-output: color-mix(in oklab, #f0a04b 90%, var(--qc-text));
  --qc-heat: var(--qc-success);
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
.qc-root :is(button, [role="button"]):focus-visible { outline: 2px solid var(--qc-accent); outline-offset: 1px; }

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
.qc-segment-thumb { position: absolute; left: 0; top: 0; z-index: 0; width: var(--qc-thumb-w, 0); height: var(--qc-thumb-h, 0); transform: translate(var(--qc-thumb-x, 0), var(--qc-thumb-y, 0)); border-radius: var(--qc-radius-sm); background: var(--qc-raised); box-shadow: var(--qc-shadow-1), 0 0 0 1px var(--qc-border); opacity: 0; pointer-events: none; }
.qc-segment[data-measured] .qc-segment-thumb { opacity: 1; }
.qc-segment[data-animate] .qc-segment-thumb { transition: transform var(--qc-dur-slow) var(--qc-ease-out), width var(--qc-dur-slow) var(--qc-ease-out); }
.qc-segment:not([data-measured]) button[aria-checked="true"] { background: var(--qc-raised); box-shadow: var(--qc-shadow-1), 0 0 0 1px var(--qc-border); }

/* Layout */
.qc-grid { display: grid; gap: var(--qc-space-3); margin-bottom: var(--qc-space-3); min-width: 0; }
.qc-kpis { grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); }
.qc-compact .qc-kpis { grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: var(--qc-space-2); }
.qc-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); }
.qc-four { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
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
.qc-kpi-label { color: var(--qc-text-2); font-size: var(--qc-font-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-kpi-value { font-size: var(--qc-font-2xl); font-weight: var(--qc-weight-bold); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.2; }
.qc-compact .qc-kpi { padding: 10px var(--qc-space-3); }
.qc-compact .qc-kpi-value { font-size: var(--qc-font-xl); }
.qc-kpi-sub { color: var(--qc-text-3); font-size: var(--qc-font-sm); }
.qc-kpi[data-tone="danger"] .qc-kpi-sub { color: var(--qc-danger); }
.qc-kpi[data-tone="warning"] .qc-kpi-sub { color: var(--qc-warning); }
.qc-kpi-skeleton { gap: var(--qc-space-2); box-shadow: none; }

.qc-muted { color: var(--qc-text-3); }
.qc-note { color: var(--qc-text-3); font-size: var(--qc-font-sm); margin: var(--qc-space-1) 0 var(--qc-space-3); }

/* Charts */
.qc-svg { display: block; width: 100%; height: auto; overflow: visible; }
.qc-svg text, .qc-trend text, .qc-trend-axis text { fill: var(--qc-text-3); font-size: 10px; font-variant-numeric: tabular-nums; }
.qc-chart { outline: none; }
.qc-chart:focus-visible { outline: 2px solid var(--qc-accent); outline-offset: 4px; border-radius: var(--qc-radius-sm); }
.qc-axis { stroke: var(--qc-border-strong); }
.qc-grid-line { stroke: var(--qc-border); stroke-dasharray: 2 3; }
.qc-band { fill: var(--qc-fill-2); opacity: 0; transition: opacity var(--qc-dur-fast) var(--qc-ease-out); }
g[data-active] > .qc-band, .qc-trend-band { opacity: 1; }
.qc-trend-band { fill: var(--qc-fill-3); transition: x var(--qc-dur-fast) var(--qc-ease-out); }
.qc-bar { transition: fill-opacity var(--qc-dur-base) var(--qc-ease-out); }
.qc-chart:has(g[data-active]) .qc-bar { fill-opacity: 0.45; }
.qc-chart g[data-active] .qc-bar { fill-opacity: 1; }
.qc-svg text.qc-value { fill: var(--qc-text-2); font-weight: var(--qc-weight-medium); }
.qc-chart g[data-active] text, .qc-root text.qc-today { fill: var(--qc-text); font-weight: var(--qc-weight-bold); }
.qc-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: var(--qc-space-2); color: var(--qc-text-2); font-size: var(--qc-font-sm); }
.qc-legend span { display: inline-flex; align-items: center; gap: 6px; }
.qc-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex: none; }
.qc-swatch-window { width: 12px; height: 2px; border-radius: 0; background: repeating-linear-gradient(90deg, var(--qc-text-3) 0 2px, transparent 2px 4px); }
.qc-swatch-rule { width: 2px; height: 11px; border-radius: 0; background: repeating-linear-gradient(var(--qc-warning) 0 3px, transparent 3px 5px); }

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

/* Chart tooltip */
.qc-tip-host { position: relative; min-width: 0; }
.qc-tip { position: absolute; left: 0; top: 0; z-index: 10; pointer-events: none; min-width: 150px; max-width: 300px; padding: var(--qc-space-2) 10px; border-radius: var(--qc-radius-md); background: var(--qc-raised); border: 1px solid var(--qc-border-strong); box-shadow: var(--qc-shadow-2); color: var(--qc-text); font-size: var(--qc-font-sm); line-height: 1.45; visibility: hidden; opacity: 0; transform: translateY(4px) scale(0.97); transform-origin: 50% 100%; transition: opacity var(--qc-dur-fast) var(--qc-ease-out), transform var(--qc-dur-base) var(--qc-ease-out), visibility 0s linear var(--qc-dur-fast); }
.qc-tip[data-below] { transform-origin: 50% 0; transform: translateY(-4px) scale(0.97); }
.qc-tip[data-open] { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }
.qc-tip[data-open][data-glide] { transition: opacity var(--qc-dur-fast) var(--qc-ease-out), transform var(--qc-dur-base) var(--qc-ease-out), left var(--qc-dur-base) var(--qc-ease-out), top var(--qc-dur-base) var(--qc-ease-out); }
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
.qc-tip-warn { color: var(--qc-warning); font-weight: var(--qc-weight-medium); }

/* Tallies */
.qc-tally { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.qc-tally button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px var(--qc-space-2); align-items: center; border: 0; background: transparent; color: inherit; font: inherit; padding: 4px 6px 5px; margin: 0; border-radius: var(--qc-radius-sm); cursor: pointer; text-align: left; transition: background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-tally button:hover { background: var(--qc-fill); }
.qc-tally button[aria-pressed="true"] { background: var(--qc-accent-soft); }
.qc-tally-bar { grid-column: 1 / -1; display: block; height: 3px; border-radius: var(--qc-radius-pill); background: var(--qc-fill); overflow: hidden; }
.qc-tally-bar > span { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--qc-accent) 50%, transparent); transform-origin: left; transition: width var(--qc-dur-slow) var(--qc-ease-out), background-color var(--qc-dur-fast) var(--qc-ease-out); }
.qc-tally button:hover .qc-tally-bar > span, .qc-tally button:focus-visible .qc-tally-bar > span, .qc-tally button[aria-pressed="true"] .qc-tally-bar > span { background: var(--qc-accent); }
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
.qc-group + .qc-group { margin-top: var(--qc-space-4); }
.qc-group-head { position: sticky; top: calc(-1 * var(--qc-pad-top)); z-index: 2; display: flex; align-items: center; gap: var(--qc-space-2); margin: 0 calc(-1 * var(--qc-card-pad)) var(--qc-space-2); padding: 6px var(--qc-card-pad); background: var(--qc-card); font-size: var(--qc-font-sm); color: var(--qc-text-2); }
.qc-group-title { font-weight: var(--qc-weight-bold); color: var(--qc-text); }
.qc-group-tokens { margin-left: auto; color: var(--qc-text-3); font-variant-numeric: tabular-nums; }
.qc-sessions { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 10px; }
.qc-session { border: 1px solid var(--qc-border); border-radius: var(--qc-radius-md); padding: 10px var(--qc-space-3); background: var(--qc-raised); text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.qc-session-title { font-weight: var(--qc-weight-bold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-path { color: var(--qc-text-3); font-size: var(--qc-font-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-meta [data-tone="warning"] { color: var(--qc-warning); }
.qc-session-meta [data-tone="danger"] { color: var(--qc-danger); }
.qc-session-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px var(--qc-space-2); color: var(--qc-text-2); font-size: var(--qc-font-sm); font-variant-numeric: tabular-nums; }

/* Stacked meters */
.qc-meter { display: block; height: 6px; border-radius: var(--qc-radius-pill); overflow: hidden; background: var(--qc-fill-2); }
.qc-meter-fill { display: flex; height: 100%; }
.qc-meter-fill > span { display: block; height: 100%; transition: width var(--qc-dur-slow) var(--qc-ease-out); }
.qc-meter-fill > span + span { box-shadow: -1px 0 0 var(--qc-card); }
.qc-meter-lg { height: 14px; border-radius: var(--qc-radius-sm); margin: var(--qc-space-2) 0 6px; }

.qc-error { color: var(--qc-danger); font-size: var(--qc-font-sm); }
.qc-empty { padding: var(--qc-space-8) 0; text-align: center; color: var(--qc-text-3); display: flex; flex-direction: column; align-items: center; gap: var(--qc-space-2); }
.qc-empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--qc-space-1); padding: var(--qc-space-8) var(--qc-space-4); text-align: center; color: var(--qc-text-3); font-size: var(--qc-font-sm); animation: qc-fade var(--qc-dur-slow) var(--qc-ease-out) backwards; }
.qc-empty-state[data-compact] { padding: var(--qc-space-4) var(--qc-space-2); }
.qc-empty-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: var(--qc-space-1); border-radius: 50%; background: var(--qc-fill-2); color: var(--qc-text-2); }
.qc-empty-state[data-compact] .qc-empty-icon { width: 32px; height: 32px; }
.qc-empty-title { color: var(--qc-text-2); font-size: var(--qc-font-md); font-weight: var(--qc-weight-medium); }
.qc-empty-hint { max-width: 30ch; }
.qc-empty-action { margin-top: var(--qc-space-2); }
.qc-icon { display: block; flex: none; }
.qc-big { font-size: var(--qc-font-2xl); font-weight: var(--qc-weight-bold); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.qc-big[data-tone="warning"] { color: var(--qc-warning); }
.qc-big[data-tone="danger"] { color: var(--qc-danger); }

/* Events + tables */
.qc-events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
.qc-events li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--qc-space-2); align-items: baseline; }
.qc-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.qc-dot[data-tone="warning"] { background: var(--qc-warning); box-shadow: 0 0 0 3px var(--qc-warning-soft); }
.qc-dot[data-tone="danger"] { background: var(--qc-danger); box-shadow: 0 0 0 3px var(--qc-danger-soft); }
.qc-dot[data-tone="neutral"] { background: var(--qc-text-3); box-shadow: 0 0 0 3px var(--qc-fill-2); }
.qc-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; table-layout: fixed; }
.qc-table td { padding: 5px 0; border-bottom: 1px solid var(--qc-border); }
.qc-table tr:last-child td { border-bottom: 0; }
.qc-table td:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: var(--qc-space-2); }
.qc-table td:last-child { text-align: right; color: var(--qc-text-2); width: 120px; }

/* Loading */
.qc-skeleton { position: relative; overflow: hidden; border-radius: var(--qc-radius-lg); background: var(--qc-fill-2); }
.qc-skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, var(--qc-fill-2), transparent); animation: qc-shimmer 1.4s ease-in-out infinite; }
.qc-spinner { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--qc-fill-3); border-top-color: currentColor; display: inline-block; animation: qc-spin 0.7s linear infinite; flex: none; }

/* Motion */
.qc-enter { animation: qc-enter var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 35ms); }
.qc-grow-y { transform-box: fill-box; transform-origin: 50% 100%; animation: qc-grow-y var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-fade { animation: qc-fade var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-fill-in { animation: qc-fill-in var(--qc-dur-slow) var(--qc-ease-out) backwards; }
.qc-tally-bar > span { animation: qc-grow-x var(--qc-dur-slow) var(--qc-ease-out) backwards; animation-delay: calc(var(--qc-i, 0) * 30ms); }
.qc-donut > svg { animation: qc-spin-in var(--qc-dur-slow) var(--qc-ease-out) backwards; }
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
.qc-root[data-qc-width="narrow"] .qc-kpi { padding: 10px var(--qc-space-3); }
.qc-root[data-qc-width="narrow"] .qc-kpi-value { font-size: var(--qc-font-xl); }
.qc-root[data-qc-width="narrow"] .qc-search { flex-basis: 100%; }
.qc-root[data-qc-width="narrow"] .qc-toolbar .qc-segment { flex: 1; }
.qc-root[data-qc-width="narrow"] .qc-grid { gap: var(--qc-space-2); margin-bottom: var(--qc-space-2); }
.qc-root[data-qc-width="wide"]:not(.qc-compact) { --qc-pad-top: var(--qc-space-6); padding: var(--qc-pad-top) var(--qc-space-8) 40px; }
.qc-root[data-qc-width="wide"] .qc-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }

@keyframes qc-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes qc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes qc-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes qc-grow-y { from { transform: scaleY(0); } to { transform: none; } }
@keyframes qc-grow-x { from { transform: scaleX(0); } to { transform: none; } }
@keyframes qc-fill-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
@keyframes qc-spin-in { from { opacity: 0; transform: rotate(-60deg) scale(0.9); } to { opacity: 1; transform: none; } }
@keyframes qc-shimmer { to { transform: translateX(100%); } }
@keyframes qc-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .qc-root *, .qc-root *::before, .qc-root *::after { animation: none !important; transition: none !important; }
  .qc-root .qc-spinner { animation: qc-spin 1.4s linear infinite !important; }
  .qc-pressable:hover, .qc-pressable:active, .qc-segment button:active { transform: none; }
}
`
