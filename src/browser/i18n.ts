const en = {
  insightsTitle: "Context Insights",
  insightsSubtitle: "Token usage across your Qoder sessions, read from local transcripts",
  refresh: "Refresh",
  loading: "Loading…",
  loadFailed: "Couldn't load context data.",
  retry: "Retry",
  rangeToday: "Today",
  range7d: "7 days",
  range30d: "30 days",
  kpiSessions: "Sessions",
  kpiTokens: "Billed tokens",
  kpiCacheHit: "Cache hit",
  kpiTurns: "Turns",
  kpiRequests: "Requests",
  kpiToolRuns: "Tool runs",
  weekTitle: "Last 7 days",
  heatmapTitle: "Activity · 8 weeks",
  heatmapHint: "Click a day to filter sessions",
  compositionTitle: "Token composition",
  cacheRead: "Cached prompt",
  uncached: "Uncached prompt",
  output: "Output",
  toolsTitle: "Tools",
  skillsTitle: "Skills",
  commandsTitle: "Commands",
  noneYet: "Nothing in this range",
  sessionsTitle: "Sessions",
  searchPlaceholder: "Search title or folder",
  sortRecent: "Recent",
  sortTokens: "Tokens",
  sortContext: "Context",
  clearFilter: "Clear",
  filteredBy: "Filtered by",
  noSessions: "No sessions match",
  moreSessions: "{count} older sessions not shown",
  untitled: "Untitled session",
  turnsShort: "{count} turns",
  openFailed: "This session isn't available in Qoder (it may be CLI-only or archived).",
  scanned: "{count} transcripts scanned",
  estimateNote: "Tool, skill and command counts cover the whole lifetime of sessions active in the range.",
  sessionTitle: "Context",
  unbound: "Open this view from a conversation's Task Monitor.",
  missing: "No local transcript found for this conversation yet.",
  statTurns: "Turns",
  statRequests: "Requests",
  statTokens: "Billed tokens",
  statCacheHit: "Cache hit",
  statToolRuns: "Tool runs",
  statToolErrors: "{count} errors",
  statCompactions: "Compactions",
  statSubagents: "Subagents",
  statSpan: "Span",
  currentTitle: "Current context",
  currentOfWindow: "of {window} window",
  windowUnknown: "Context window unknown",
  trendTitle: "Per-request context",
  trendHint: "One bar per model request; dashed lines mark compactions",
  trendTruncated: "Showing the latest {shown} of {total} requests",
  eventsTitle: "Context events",
  eventsEmpty: "No compactions, retries or errors",
  compaction: "Compaction ({trigger})",
  compactionDetail: "{pre} → {post} · {duration}",
  retryEvent: "Retry",
  errorEvent: "Error",
  filesTitle: "File activity",
  reads: "read {count}",
  writes: "write {count}",
  request: "Request #{index}",
  turn: "turn {turn}",
  prompt: "prompt",
  cached: "cached",
  justNow: "just now",
  minutesAgo: "{count}m ago",
  hoursAgo: "{count}h ago",
  daysAgo: "{count}d ago",
}

type Messages = typeof en

export type MessageKey = keyof Messages
export type Translate = (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string

export function createTranslate(_locale: string): Translate {
  const messages: Messages = en
  return (key, values) =>
    messages[key].replace(/\{(\w+)\}/g, (match, name: string) => (values && name in values ? String(values[name]) : match))
}

export function relativeTime(t: Translate, at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return t("justNow")
  if (minutes < 60) return t("minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("hoursAgo", { count: hours })
  return t("daysAgo", { count: Math.floor(hours / 24) })
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
