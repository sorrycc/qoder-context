import type { SessionResponse } from "../shared/types.js"
import { describe, foldTranscript, isSessionId, type TranscriptLocator } from "./transcripts.js"

const CACHE_SIZE = 4

/**
 * Serves per-session detail. A caller that passes the `version` it already holds gets
 * `unchanged` without a re-fold while the transcript (and its subagents) stay untouched; recent
 * folds are kept so several open views share one parse.
 */
export class SessionDetails {
  private readonly recent = new Map<string, Extract<SessionResponse, { status: "ok" }>>()

  constructor(private readonly locator: TranscriptLocator) {}

  async load(sessionId: unknown, known?: unknown): Promise<SessionResponse> {
    if (!isSessionId(sessionId)) return { status: "unbound" }
    const file = await this.locator.find(sessionId)
    const transcript = file ? await describe(file, sessionId) : null
    if (!transcript) return { status: "missing" }
    const { version } = transcript
    if (known === version) return { status: "unchanged", version }
    const cached = this.recent.get(sessionId)
    if (cached?.version === version) return cached
    const response = { status: "ok", version, detail: (await foldTranscript(transcript.file, sessionId)).detail() } as const
    this.recent.delete(sessionId)
    this.recent.set(sessionId, response)
    if (this.recent.size > CACHE_SIZE) this.recent.delete(this.recent.keys().next().value!)
    return response
  }
}
