// Packaged Qoder hashes its CSS variable names, so the palette is derived from the host's computed
// text and background colours (set inline as --qc-text / --qc-surface) instead of token names.
export const STYLES = `
.qc-root {
  --qc-text: CanvasText;
  --qc-surface: Canvas;
  --qc-text-2: color-mix(in srgb, var(--qc-text) 72%, transparent);
  --qc-text-3: color-mix(in srgb, var(--qc-text) 50%, transparent);
  --qc-border: color-mix(in srgb, var(--qc-text) 12%, transparent);
  --qc-fill: color-mix(in srgb, var(--qc-text) 5%, transparent);
  --qc-fill-2: color-mix(in srgb, var(--qc-text) 10%, transparent);
  --qc-primary: #5b7cf7;
  --qc-cached: #2bb3a3;
  --qc-uncached: #5b7cf7;
  --qc-output: #f0a04b;
  --qc-heat: #2bb3a3;
  --qc-warning: #e0a020;
  --qc-error: #e5484d;
  box-sizing: border-box;
  color: var(--qc-text);
  font-size: 13px;
  line-height: 1.5;
  padding: 20px 24px 32px;
  min-width: 0;
  height: 100%;
  overflow: auto;
}
.qc-root *, .qc-root *::before, .qc-root *::after { box-sizing: border-box; }
.qc-root.qc-compact { padding: 12px 12px 24px; }
.qc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.qc-head h1 { font-size: 18px; font-weight: 600; margin: 0; }
.qc-head p { margin: 2px 0 0; color: var(--qc-text-2); }
.qc-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qc-segment { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--qc-fill); }
.qc-segment button { border: 0; background: transparent; color: var(--qc-text-2); padding: 3px 10px; border-radius: 6px; font: inherit; cursor: pointer; }
.qc-segment button[aria-pressed="true"] { background: var(--qc-fill-2); color: var(--qc-text); }
.qc-grid { display: grid; gap: 12px; margin-bottom: 12px; min-width: 0; }
.qc-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.qc-two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); }
.qc-four { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.qc-card { border: 1px solid var(--qc-border); border-radius: 12px; padding: 14px 16px; min-width: 0; background: var(--qc-fill); }
.qc-card h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 8px; }
.qc-card h2 small { font-weight: 400; color: var(--qc-text-3); font-size: 12px; }
.qc-kpi { padding: 12px 14px; }
.qc-kpi-label { color: var(--qc-text-2); font-size: 12px; }
.qc-kpi-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.qc-kpi-sub { color: var(--qc-text-3); font-size: 12px; }
.qc-muted { color: var(--qc-text-3); }
.qc-note { color: var(--qc-text-3); font-size: 12px; margin: 4px 0 12px; }
.qc-svg { display: block; width: 100%; height: auto; overflow: visible; }
.qc-svg text { fill: var(--qc-text-3); font-size: 10px; }
.qc-trend { display: block; overflow: visible; }
.qc-trend text { fill: var(--qc-text-3); font-size: 10px; }
.qc-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; color: var(--qc-text-2); font-size: 12px; }
.qc-legend span { display: inline-flex; align-items: center; gap: 6px; }
.qc-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.qc-donut { display: flex; align-items: center; gap: 16px; }
.qc-donut svg { width: 104px; height: 104px; flex: none; }
.qc-donut-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; font-size: 12px; }
.qc-donut-legend li { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 6px; align-items: center; }
.qc-donut-legend .qc-count { grid-column: 2; }
.qc-tally { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.qc-tally button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; border: 0; background: transparent; color: inherit; font: inherit; padding: 3px 6px; border-radius: 6px; cursor: pointer; text-align: left; position: relative; }
.qc-tally button:hover, .qc-tally button[aria-pressed="true"] { background: var(--qc-fill-2); }
.qc-tally .qc-bar-bg { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--qc-fill); z-index: 0; }
.qc-tally .qc-name, .qc-tally .qc-count { position: relative; z-index: 1; }
.qc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-count { color: var(--qc-text-2); font-variant-numeric: tabular-nums; }
.qc-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.qc-toolbar input { min-width: 200px; flex: 1 1 220px; }
.qc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; background: var(--qc-fill-2); font-size: 12px; }
.qc-chip button { border: 0; background: transparent; color: var(--qc-text-2); cursor: pointer; font: inherit; padding: 0; }
.qc-sessions { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 10px; }
.qc-session { border: 1px solid var(--qc-border); border-radius: 10px; padding: 10px 12px; background: transparent; text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.qc-session:hover { background: var(--qc-fill); }
.qc-session-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-path { color: var(--qc-text-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-session-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--qc-text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
.qc-stack { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--qc-fill-2); }
.qc-stack > span { display: block; height: 100%; }
.qc-error { color: var(--qc-error); font-size: 12px; }
.qc-empty { padding: 32px 0; text-align: center; color: var(--qc-text-3); }
.qc-context-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: var(--qc-fill-2); margin: 8px 0 6px; }
.qc-context-bar > span { display: block; height: 100%; }
.qc-big { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.qc-scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
.qc-events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
.qc-events li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: baseline; }
.qc-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.qc-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; table-layout: fixed; }
.qc-table td { padding: 3px 0; border-bottom: 1px solid var(--qc-border); }
.qc-table td:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-table td:last-child { text-align: right; color: var(--qc-text-2); width: 120px; }
.qc-skeleton { height: 92px; border-radius: 12px; background: var(--qc-fill); }
.qc-heat-cell { cursor: pointer; }
.qc-heat-cell:hover { stroke: var(--qc-text-2); }
`
