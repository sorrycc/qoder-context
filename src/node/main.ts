import type { Activate, PluginNodeJsonValue } from "@qoder/plugin-api"
import { join } from "node:path"
import { formatTokens } from "../shared/format.js"
import { SERVICE_NAME, type Range, type SessionSummary } from "../shared/types.js"
import { FoldCache } from "./folds.js"
import { HostUsageReader } from "./host-usage.js"
import { OverviewIndex } from "./overview.js"
import { SessionDetails } from "./session.js"
import { describe, isSessionId, resolveProjectsRoot, TranscriptLocator } from "./transcripts.js"

const RANGES: readonly Range[] = ["today", "7d", "30d"]

export const activate: Activate = (context) => {
  const locator = new TranscriptLocator(resolveProjectsRoot(context.product.id))
  const report = (event: string, error: unknown) =>
    context.diagnostics.emit({
      level: "warn",
      source: SERVICE_NAME,
      event,
      data: { error: error instanceof Error ? error.name : "unknown" },
    })
  const folds = new FoldCache()
  const index = new OverviewIndex(locator, join(context.storagePath, "overview-cache.json"), report, folds)
  // The plugin's storage sits at <app data>/app-plugin-data/<plugin id>, beside the app's own database.
  const host = new HostUsageReader(join(context.storagePath, "..", "..", "main.sqlite"), report)
  const details = new SessionDetails(locator, folds, host)

  const summaryFor = async (sessionId: string): Promise<SessionSummary | null> => {
    const file = await locator.find(sessionId)
    const transcript = file ? await describe(file, sessionId) : null
    if (!transcript) return null
    return index.cached(transcript.file, transcript.version) ?? (await folds.use(transcript, (fold) => fold.summary()))
  }

  context.subscriptions.push(
    context.api.node.registerService({
      name: SERVICE_NAME,
      methods: {
        overview: async (input) => {
          const range = RANGES.find((candidate) => candidate === input.range) ?? "7d"
          return json(await index.load(range, input.version))
        },
        session: async (input, serviceContext) =>
          json(await details.load(serviceContext.sessionResource?.sessionId ?? input.sessionId, input.version)),
      },
    }),
    context.api.sessionResources.registerProvider("context", {
      listResources: async (_input, resourceContext) => {
        if (!isSessionId(resourceContext.sessionId)) return { items: [] }
        const summary = await summaryFor(resourceContext.sessionId).catch((error: unknown) => {
          report("resource.list_failed", error)
          return null
        })
        if (!summary || summary.requests === 0) return { items: [] }
        return { items: [{ id: "context", label: resourceLabel(summary), icon: "book-ai" }] }
      },
      resolveResourcePreview: () => ({ title: "Context" }),
    }),
  )
}

/** Language-neutral label; the host renders it inside its own localized section title. */
function resourceLabel(summary: SessionSummary): string {
  const used = formatTokens(summary.contextTokens)
  if (!summary.contextWindow) return `${used} tokens`
  const share = ((summary.contextTokens / summary.contextWindow) * 100).toFixed(1)
  return `${used} / ${formatTokens(summary.contextWindow)} · ${share}%`
}

function json(value: unknown): PluginNodeJsonValue {
  return value as PluginNodeJsonValue
}
