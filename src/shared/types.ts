export const SERVICE_NAME = "context"

export type Range = "today" | "7d" | "30d"

export interface TokenTotals {
  /** Full prompt size sent to the model, cached part included. */
  readonly prompt: number
  readonly cacheRead: number
  readonly cacheCreate: number
  readonly output: number
}

export interface Tally {
  readonly name: string
  readonly count: number
  readonly lastAt: number
}

export interface DayBucket {
  readonly day: string
  readonly tokens: number
  readonly requests: number
  readonly turns: number
  readonly toolRuns: number
  /** Model, tool and compaction time started that day (see TimingStats). */
  readonly activeMs: number
  /** Shell runs that finished that day with a success or a failure, and how many failed. */
  readonly shellRuns: number
  readonly shellFailures: number
}

/** Compact per-session facts; cached on disk and aggregated by the overview. */
export interface SessionSummary {
  readonly id: string
  readonly title: string | null
  readonly cwd: string | null
  readonly gitBranch: string | null
  readonly model: string | null
  readonly firstAt: number
  readonly lastAt: number
  readonly turns: number
  readonly requests: number
  readonly tokens: TokenTotals
  /** Prompt size of the latest main-agent request, i.e. what the window holds now. */
  readonly contextTokens: number
  readonly contextWindow: number | null
  readonly compactions: number
  readonly toolRuns: number
  readonly toolErrors: number
  readonly subagents: number
  readonly days: readonly DayBucket[]
  readonly tools: readonly Tally[]
  readonly skills: readonly Tally[]
  readonly commands: readonly Tally[]
}

export interface RequestPoint {
  readonly at: number
  readonly turn: number
  readonly prompt: number
  readonly cacheRead: number
  readonly output: number
  readonly model: string | null
  readonly tools: readonly string[]
  /** Time from the entry before this request (a prompt or tool result) to its reply; null when unknown. */
  readonly latencyMs: number | null
}

/** How a shell run ended. Background runs return at once and finish out of sight. */
export type CommandStatus = "ok" | "failed" | "cancelled" | "background" | "running"

export interface CommandRun {
  readonly id: string
  /** The command line, cut to a few hundred characters. */
  readonly command: string
  readonly programs: readonly string[]
  readonly at: number
  /** From the reply that issued the run to its result; null while running. */
  readonly durationMs: number | null
  readonly status: CommandStatus
  readonly exitCode: number | null
  /** Index of the main-agent request that issued it, counted from the session's first request. */
  readonly requestIndex: number | null
  readonly turn: number
  readonly subagent: boolean
}

/**
 * Where the session's active time went, in milliseconds. Model time runs from a prompt or tool
 * result to the reply; tool time from a reply to its last tool result; compaction time is what the
 * compactor reported. Gaps waiting for the user aren't counted.
 */
export interface TimingStats {
  readonly modelMs: number
  readonly toolMs: number
  readonly compactMs: number
  /** Output tokens of the timed requests, for an output rate over model time. */
  readonly timedOutput: number
  /** The active time in equal slices, oldest first: how much of each slice each kind took. */
  readonly ribbon: readonly { readonly model: number; readonly tool: number; readonly compact: number }[]
}

export type ContextEvent =
  | {
      readonly kind: "compaction"
      readonly at: number
      readonly trigger: "manual" | "auto" | "unknown"
      readonly preTokens: number | null
      readonly postTokens: number | null
      readonly durationMs: number | null
      readonly requestIndex: number
    }
  | { readonly kind: "retry" | "error"; readonly at: number; readonly text: string; readonly requestIndex: number }

export interface FileActivity {
  readonly path: string
  readonly reads: number
  readonly writes: number
  /** Lines the writes added and removed, from the edit inputs (a whole-file write counts as added). */
  readonly added: number
  readonly removed: number
  readonly lastAt: number
}

export interface SessionDetail {
  readonly summary: SessionSummary
  readonly requests: readonly RequestPoint[]
  readonly requestsTruncated: number
  readonly events: readonly ContextEvent[]
  readonly files: readonly FileActivity[]
  /** Shell runs, oldest first, main agent and subagents. */
  readonly commands: readonly CommandRun[]
  readonly commandsTruncated: number
  readonly timing: TimingStats
}

/** `version` identifies the transcript state; pass it back to get `unchanged` until it moves. */
export type SessionResponse =
  | { readonly status: "ok"; readonly version: string; readonly detail: SessionDetail }
  | { readonly status: "unchanged"; readonly version: string }
  | { readonly status: "missing" | "unbound" }

export interface SessionCard {
  readonly id: string
  readonly title: string | null
  readonly cwd: string | null
  readonly lastAt: number
  readonly tokens: number
  readonly turns: number
  readonly requests: number
  readonly contextTokens: number
  readonly contextWindow: number | null
  readonly cacheRead: number
  readonly prompt: number
  readonly output: number
  readonly days: readonly string[]
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  readonly commands: readonly string[]
}

/** One project folder's share of the range. */
export interface WorkspaceTally {
  readonly path: string
  readonly sessions: number
  readonly tokens: number
  readonly activeMs: number
  readonly lastAt: number
}

export interface Overview {
  readonly range: Range
  readonly generatedAt: number
  readonly scannedFiles: number
  readonly kpi: {
    readonly sessions: number
    readonly tokens: number
    readonly cacheHitRate: number | null
    readonly turns: number
    readonly requests: number
    readonly toolRuns: number
    readonly activeMs: number
    readonly shellRuns: number
    readonly shellFailures: number
  }
  readonly week: readonly DayBucket[]
  readonly heatmap: readonly { readonly day: string; readonly tokens: number; readonly requests: number }[]
  readonly composition: { readonly cacheRead: number; readonly uncached: number; readonly output: number }
  readonly tools: readonly Tally[]
  readonly skills: readonly Tally[]
  readonly commands: readonly Tally[]
  /** Folders by billed tokens in range; sessions without a folder are left out. */
  readonly workspaces: readonly WorkspaceTally[]
  readonly sessions: readonly SessionCard[]
  readonly sessionsTruncated: number
}

/** Like SessionResponse: pass `version` back to get `unchanged` while nothing it covers moved. */
export type OverviewResponse =
  | { readonly status: "ok"; readonly version: string; readonly overview: Overview }
  | { readonly status: "unchanged"; readonly version: string }

export function billed(tokens: TokenTotals): number {
  return tokens.prompt + tokens.output
}
