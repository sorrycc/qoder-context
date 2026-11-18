# Features

qoder-context adds two views to Qoder Desktop: **Context Insights** across all your sessions, and **Context** for a
single conversation.

- **Context Insights** (sidebar, `workbench.sidebar.secondary`): KPIs for the picked range
  (sessions, billed tokens, **Credits**, cache-hit rate, turns and requests, tool runs, active time and
  the share of finished shell commands that failed), a 7-day chart of billed tokens beside credits, an
  8-week activity heatmap, a **Workspaces** breakdown of tokens, credits, sessions and active time per
  project folder, the token composition, tool/skill/command tallies with when each was last used, and
  searchable session cards (with a context-fill ring and credits) that open the session in Qoder,
  grouped by date or by folder and sortable by recency, tokens, credits or context. Clicking a heatmap
  day, a folder or a tally filters the cards; a picked day also narrows the tallies to that day.
- **Context** (per conversation, in the Task Monitor's "Context" section): a context ring against
  the model window with headroom, cached/uncached split and an estimate of how many requests still fit
  at the recent growth rate; turn/request/token/credit/cache stats; a trend with one bar per request
  or per turn and compaction markers, shown as the stacked prompt (**Total**) or each bar's change in
  size (**Delta**), where clicking a bar, a ✂ marker, a context event or a command's `#n` pins it and
  shows its details with a brief: the turn's message, what came in (your message, which tools'
  results, a compaction) and what the reply said and called; **Context composition**: what the window
  holds now split into system prompt and tools, skills, user messages, injected context, tool calls
  and results, reasoning and answers; a **Timing** card splitting active time into model, tool and
  compaction time with a time ribbon and an output rate; a timeline of context events (compactions,
  injected context such as the skill list, memories, hook output, MCP tools and attached files with
  their rough size, model and reasoning-effort switches, plan and auto mode, retries and errors;
  repeats folded, filterable by kind); file activity with the lines edits added and removed and the
  files Grep and Glob turned up, filterable into edited, read-only, searched and images; tools;
  **Models** with each model's requests, tokens and credits; **Subagents**, the session's agents as a
  tree under whoever launched them with their status, type, task, tokens, credits and final report;
  and **Command executions**: every shell run with its outcome (succeeded, failed with exit code,
  cancelled, backgrounded, running), wall time and request, filterable by All/Failed/Slow/Background,
  program and text, sorted by latest or slowest. Rows show details on hover or focus.
  It refreshes every 15 s while visible; a poll for an unchanged transcript returns early without
  re-reading it, and only numbers that changed animate.
- Charts show a tooltip on hover. Focus a chart (Tab) and use the arrow keys, Home and End to
  step through days or requests; in the heatmap, Up/Down move by day, Left/Right by week, and Enter
  filters by the focused day.

UI is in English and Simplified Chinese and follows the host language and theme. English counts
pluralize ("1 turn", "2 turns") and numbers, dates and times are formatted in the host language.

## Layout

Context Insights, top to bottom: the title row with the range switch (Today / 7 days / 30 days) and
Refresh; eight KPI tiles (four across, two across in a narrow sidebar, eight across on wide screens);
the 7-day bars beside the 8-week heatmap; Workspaces beside the token composition donut; the tool,
skill and command tallies; then the session cards, grouped under sticky day or folder headers, with
search and sort.

The per-session Context view opens with the context ring and its KPI tiles, then the trend (requests
or turns; pin a bar to see its details and brief), Context composition beside Timing, Context events
beside File activity, Tools beside Models, then Subagents (when there are any) and Command executions
across the full width.

Both views use the host's text and background colours, so they match Qoder's light and dark themes
(checked in a dev Qoder in dark mode). Loading shows skeletons in the final layout; failures and empty
ranges show an icon, a title, a hint and, where it helps, a Retry button. Motion is limited to
transforms and opacity (cards rise in, bars grow, numbers count, the segmented controls' highlight
slides) and is switched off under `prefers-reduced-motion`.
