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
  readonly lastAt: number
}

export interface SessionDetail {
  readonly summary: SessionSummary
  readonly requests: readonly RequestPoint[]
  readonly requestsTruncated: number
  readonly events: readonly ContextEvent[]
  readonly files: readonly FileActivity[]
}

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
  }
  readonly week: readonly DayBucket[]
  readonly heatmap: readonly { readonly day: string; readonly tokens: number; readonly requests: number }[]
  readonly composition: { readonly cacheRead: number; readonly uncached: number; readonly output: number }
  readonly tools: readonly Tally[]
  readonly skills: readonly Tally[]
  readonly commands: readonly Tally[]
  readonly sessions: readonly SessionCard[]
  readonly sessionsTruncated: number
}

export function billed(tokens: TokenTotals): number {
  return tokens.prompt + tokens.output
}
