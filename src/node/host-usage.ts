import { stat } from "node:fs/promises"
import type { HostUsage } from "../shared/types.js"

type Sqlite = typeof import("node:sqlite")

const SNAPSHOT_LIMIT = 2 * 1024 * 1024
/** How long a read waits on a writer before giving up; reads never block Qoder's own writes. */
const BUSY_MS = 100

/**
 * Reads the context meter Qoder Desktop saved for a session from its own database (`main.sqlite`,
 * table `chat_session_context_usage`). Nothing in the plugin API exposes it, so this is a best-effort
 * read-only peek: any missing piece (no `node:sqlite`, no database, no table, no row, an unknown
 * shape) gives null and the view falls back to its own estimate.
 */
export class HostUsageReader {
  private sqlite: Promise<Sqlite | null> | null = null

  constructor(
    private readonly file: string | null,
    private readonly onError: (event: string, error: unknown) => void = () => undefined,
  ) {}

  async read(sessionId: string): Promise<HostUsage | null> {
    if (!this.file || !(await stat(this.file).catch(() => null))?.isFile()) return null
    this.sqlite ??= import("node:sqlite").catch(() => null)
    const sqlite = await this.sqlite
    if (!sqlite) return null
    let database: InstanceType<Sqlite["DatabaseSync"]> | null = null
    try {
      database = new sqlite.DatabaseSync(this.file, { readOnly: true, timeout: BUSY_MS })
      const row = database.prepare("SELECT snapshot_json, updated_at FROM chat_session_context_usage WHERE session_id = ?").get(sessionId) as
        | { readonly snapshot_json?: unknown; readonly updated_at?: unknown }
        | undefined
      if (!row || typeof row.snapshot_json !== "string" || row.snapshot_json.length > SNAPSHOT_LIMIT) return null
      return parseHostUsage(JSON.parse(row.snapshot_json), Number(row.updated_at))
    } catch (error) {
      this.onError("host_usage.read_failed", error)
      return null
    } finally {
      database?.close()
    }
  }
}

/**
 * The window shares in a saved snapshot. Categories carry `percentage` as a share of the window;
 * older builds wrote 0–100, so shares that add up to more than 1.5 are scaled down.
 */
export function parseHostUsage(snapshot: unknown, updatedAt: number): HostUsage | null {
  if (typeof snapshot !== "object" || snapshot === null || !Number.isFinite(updatedAt)) return null
  const { categories } = snapshot as { readonly categories?: unknown }
  if (!Array.isArray(categories)) return null
  const shares = new Map<string, number>()
  for (const category of categories) {
    if (typeof category !== "object" || category === null) continue
    const { type, percentage } = category as { readonly type?: unknown; readonly percentage?: unknown }
    if (typeof type === "string" && typeof percentage === "number" && Number.isFinite(percentage) && percentage >= 0) {
      shares.set(type, (shares.get(type) ?? 0) + percentage)
    }
  }
  const total = [...shares.values()].reduce((sum, share) => sum + share, 0)
  if (total <= 0) return null
  const scale = total > 1.5 ? 1 / 100 : 1
  const share = (type: string) => (shares.get(type) ?? 0) * scale
  const parts = { systemPrompt: share("system_prompt"), tools: share("system_tools"), skills: share("skills"), messages: share("messages") }
  const used = parts.systemPrompt + parts.tools + parts.skills + parts.messages + share("other")
  if (used <= 0) return null
  return { at: updatedAt, used, ...parts }
}
