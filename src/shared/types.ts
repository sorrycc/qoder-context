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
  /** Qoder credits the day's billable requests reported, and how many requests reported any. */
  readonly credits: number
  readonly metered: number
  readonly turns: number
  readonly toolRuns: number
  /** Model, tool and compaction time started that day (see TimingStats). */
  readonly activeMs: number
  /** Shell runs that finished that day with a success or a failure, and how many failed. */
  readonly shellRuns: number
  readonly shellFailures: number
}

/** A day's tool, skill and command tallies, so the overview can count exactly by range or day. */
export interface DayTallies {
  readonly day: string
  readonly tools: readonly Tally[]
  readonly skills: readonly Tally[]
  readonly commands: readonly Tally[]
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
  /**
   * Qoder credits from each request's own metering (`usage.credits`, after discounts) and before
   * discounts; requests marked not billable are left out. `metered` counts the requests that
   * reported credits at all: `auto` requests and older transcripts don't.
   */
  readonly credits: number
  readonly originalCredits: number
  readonly metered: number
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
  readonly dayTallies: readonly DayTallies[]
}

/** What led into a request: the user's message, tool results, a compaction or something else (a reminder, a notification). */
export type RequestCause = "prompt" | "tools" | "compact" | "other"

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
  /** Credits the request reported, or null when it reported none. */
  readonly credits: number | null
  readonly cause: RequestCause
  /** The start of the reply's text, if it wrote any. */
  readonly reply: string | null
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
  | {
      readonly kind: "inject"
      readonly at: number
      readonly item: InjectItem
      /** What was injected, by name: skills, files, a hook event, MCP servers or tools. */
      readonly label: string
      /** How many skills, files or tools it lists, when it lists any. */
      readonly count: number | null
      /** Rough token size of the injected text. */
      readonly tokens: number
      readonly requestIndex: number
    }
  | { readonly kind: "model"; readonly at: number; readonly from: string; readonly to: string; readonly requestIndex: number }
  | { readonly kind: "mode"; readonly at: number; readonly mode: "plan" | "auto"; readonly active: boolean; readonly requestIndex: number }

/** Context qodercli adds to the conversation on its own, by what it is. */
export type InjectItem = "skillList" | "skill" | "memory" | "hook" | "mcpInstructions" | "mcpTools" | "file" | "restoredFiles" | "agentList"

export interface FileActivity {
  readonly path: string
  readonly reads: number
  readonly writes: number
  /** Lines the writes added and removed, from the edit inputs (a whole-file write counts as added). */
  readonly added: number
  readonly removed: number
  /** Times the file turned up in Grep or Glob results. */
  readonly searches: number
  readonly image: boolean
  readonly lastAt: number
}

/**
 * Estimated make-up of what the window holds now, in tokens, from the transcript since the last
 * compaction. The system prompt and tool schemas aren't written to disk; whatever the estimates
 * leave of the prompt is theirs.
 */
export interface ContextEstimate {
  readonly user: number
  readonly injected: number
  readonly skills: number
  readonly toolCalls: number
  readonly reasoning: number
  readonly answers: number
}

/**
 * Qoder's own context meter for the session, as the desktop app last saved it: shares of the model
 * window (0–1). Only the latest snapshot is kept, and only for sessions the app measured.
 */
export interface HostUsage {
  readonly at: number
  readonly used: number
  readonly systemPrompt: number
  readonly tools: number
  readonly skills: number
  readonly messages: number
}

export interface ModelUsage {
  readonly model: string
  readonly requests: number
  readonly tokens: number
  readonly credits: number
  readonly metered: number
}

export type AgentStatus = "running" | "done" | "failed" | "stopped" | "unknown"

/** One subagent of the session, with who launched it: the main agent (null) or another subagent. */
export interface FleetAgent {
  readonly id: string
  readonly parent: string | null
  readonly type: string | null
  readonly description: string | null
  readonly model: string | null
  readonly status: AgentStatus
  readonly requests: number
  readonly tokens: number
  readonly credits: number
  readonly toolRuns: number
  /** Prompt size of its latest request. */
  readonly contextTokens: number
  readonly firstAt: number
  readonly lastAt: number
  /** The start of its final report. */
  readonly result: string | null
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
  /** The opening message of each turn the shown requests belong to. */
  readonly prompts: readonly { readonly turn: number; readonly text: string }[]
  readonly estimate: ContextEstimate
  readonly host: HostUsage | null
  readonly models: readonly ModelUsage[]
  readonly agents: readonly FleetAgent[]
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
  readonly credits: number
  readonly metered: number
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
  readonly credits: number
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
    readonly credits: number
    readonly metered: number
  }
  readonly week: readonly DayBucket[]
  readonly heatmap: readonly { readonly day: string; readonly tokens: number; readonly requests: number }[]
  readonly composition: { readonly cacheRead: number; readonly uncached: number; readonly output: number }
  readonly tools: readonly Tally[]
  readonly skills: readonly Tally[]
  readonly commands: readonly Tally[]
  /** Tallies of each active heatmap day, for narrowing the cards to the picked day. */
  readonly dayTallies: Readonly<Record<string, Omit<DayTallies, "day">>>
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
