import { Button, Input } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { useMemo, useState } from "react"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type Overview, type Range, type SessionCard, type Tally } from "../shared/types.js"
import { Donut, Heatmap, MiniStack, SERIES, WeekBars } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { relativeTime, type MessageKey, type Translate } from "./i18n.js"

type Sort = "recent" | "tokens" | "context"
type TallyKind = "tools" | "skills" | "commands"
interface Filter {
  readonly day: string | null
  readonly tally: { readonly kind: TallyKind; readonly name: string } | null
  readonly query: string
}

const RANGE_LABELS: Record<Range, MessageKey> = { today: "rangeToday", "7d": "range7d", "30d": "range30d" }

registerView((context, t) => <Insights context={context} t={t} />)

function Insights({ context, t }: { readonly context: PluginViewContext; readonly t: Translate }) {
  const [range, setRange] = useState<Range>("7d")
  const overview = useLoad(
    context,
    async () => (await context.api.node.callService(SERVICE_NAME, "overview", { range }, { timeoutMs: 60_000 })) as unknown as Overview,
    range,
  )
  const data = overview.data

  return (
    <>
      <header className="qc-head">
        <div>
          <h1>{t("insightsTitle")}</h1>
          <p>
            {t("insightsSubtitle")}
            {data ? <span className="qc-muted"> · {t("scanned", { count: data.scannedFiles })}</span> : null}
          </p>
        </div>
        <div className="qc-actions">
          <div className="qc-segment" role="group">
            {(Object.keys(RANGE_LABELS) as Range[]).map((value) => (
              <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
                {t(RANGE_LABELS[value])}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={overview.loading} onClick={overview.reload}>
            {overview.loading && data ? t("loading") : t("refresh")}
          </Button>
        </div>
      </header>
      {overview.error && !data ? (
        <div className="qc-empty">
          <p className="qc-error">{t("loadFailed")}</p>
          <Button variant="secondary" size="sm" onClick={overview.reload}>
            {t("retry")}
          </Button>
        </div>
      ) : data ? (
        <Dashboard context={context} data={data} t={t} />
      ) : (
        <Placeholder />
      )}
    </>
  )
}

function Placeholder() {
  return (
    <>
      <div className="qc-grid qc-kpis">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="qc-skeleton" style={{ height: 72 }} />
        ))}
      </div>
      <div className="qc-grid qc-two">
        <div className="qc-skeleton" style={{ height: 180 }} />
        <div className="qc-skeleton" style={{ height: 180 }} />
      </div>
    </>
  )
}

function Dashboard({ context, data, t }: { readonly context: PluginViewContext; readonly data: Overview; readonly t: Translate }) {
  const [filter, setFilter] = useState<Filter>({ day: null, tally: null, query: "" })
  const [sort, setSort] = useState<Sort>("recent")
  const [openError, setOpenError] = useState<string | null>(null)
  const sessions = useMemo(() => visibleSessions(data.sessions, filter, sort), [data.sessions, filter, sort])
  const toggleTally = (kind: TallyKind, name: string) =>
    setFilter((current) => ({
      ...current,
      tally: current.tally?.kind === kind && current.tally.name === name ? null : { kind, name },
    }))
  const open = (id: string) => {
    setOpenError(null)
    context.api.chat.revealLocalSession(id).catch(() => setOpenError(id))
  }

  return (
    <>
      <div className="qc-grid qc-kpis">
        <Kpi label={t("kpiSessions")} value={String(data.kpi.sessions)} />
        <Kpi label={t("kpiTokens")} value={formatTokens(data.kpi.tokens)} />
        <Kpi label={t("kpiCacheHit")} value={formatPercent(data.kpi.cacheHitRate)} />
        <Kpi label={t("kpiTurns")} value={String(data.kpi.turns)} />
        <Kpi label={t("kpiRequests")} value={String(data.kpi.requests)} />
        <Kpi label={t("kpiToolRuns")} value={String(data.kpi.toolRuns)} />
      </div>
      <div className="qc-grid qc-two">
        <section className="qc-card">
          <h2>{t("weekTitle")}</h2>
          <WeekBars days={data.week} locale={context.locale} />
        </section>
        <section className="qc-card">
          <h2>
            {t("heatmapTitle")}
            <small>{t("heatmapHint")}</small>
          </h2>
          <Heatmap cells={data.heatmap} selected={filter.day} onSelect={(day) => setFilter((current) => ({ ...current, day }))} />
        </section>
      </div>
      <div className="qc-grid qc-four">
        <section className="qc-card">
          <h2>{t("compositionTitle")}</h2>
          <Donut
            parts={[
              { label: t("cacheRead"), value: data.composition.cacheRead, color: SERIES.cacheRead },
              { label: t("uncached"), value: data.composition.uncached, color: SERIES.uncached },
              { label: t("output"), value: data.composition.output, color: SERIES.output },
            ]}
          />
        </section>
        <TallyCard title={t("toolsTitle")} kind="tools" tallies={data.tools} filter={filter} onToggle={toggleTally} t={t} />
        <TallyCard title={t("skillsTitle")} kind="skills" tallies={data.skills} filter={filter} onToggle={toggleTally} t={t} />
        <TallyCard title={t("commandsTitle")} kind="commands" tallies={data.commands} filter={filter} onToggle={toggleTally} t={t} />
      </div>
      <p className="qc-note">{t("estimateNote")}</p>
      <section className="qc-card">
        <h2>
          {t("sessionsTitle")}
          <small>{sessions.length}</small>
        </h2>
        <div className="qc-toolbar">
          <Input
            value={filter.query}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => setFilter((current) => ({ ...current, query: event.currentTarget.value }))}
          />
          <div className="qc-segment" role="group">
            {(["recent", "tokens", "context"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>
                {t(value === "recent" ? "sortRecent" : value === "tokens" ? "sortTokens" : "sortContext")}
              </button>
            ))}
          </div>
          {filter.day || filter.tally ? (
            <span className="qc-chip">
              {t("filteredBy")}: {[filter.day, filter.tally?.name].filter(Boolean).join(" · ")}
              <button type="button" onClick={() => setFilter((current) => ({ ...current, day: null, tally: null }))}>
                ✕ {t("clearFilter")}
              </button>
            </span>
          ) : null}
        </div>
        {openError ? <p className="qc-error">{t("openFailed")}</p> : null}
        {sessions.length === 0 ? (
          <div className="qc-empty">{t("noSessions")}</div>
        ) : (
          <div className="qc-sessions">
            {sessions.map((session) => (
              <SessionTile key={session.id} session={session} onOpen={open} t={t} />
            ))}
          </div>
        )}
        {data.sessionsTruncated > 0 ? <p className="qc-note">{t("moreSessions", { count: data.sessionsTruncated })}</p> : null}
      </section>
    </>
  )
}

function Kpi({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="qc-card qc-kpi">
      <div className="qc-kpi-label">{label}</div>
      <div className="qc-kpi-value">{value}</div>
    </div>
  )
}

function TallyCard({
  title,
  kind,
  tallies,
  filter,
  onToggle,
  t,
}: {
  readonly title: string
  readonly kind: TallyKind
  readonly tallies: readonly Tally[]
  readonly filter: Filter
  readonly onToggle: (kind: TallyKind, name: string) => void
  readonly t: Translate
}) {
  const max = Math.max(1, ...tallies.map((tally) => tally.count))
  return (
    <section className="qc-card">
      <h2>{title}</h2>
      {tallies.length === 0 ? (
        <p className="qc-muted">{t("noneYet")}</p>
      ) : (
        <ul className="qc-tally">
          {tallies.slice(0, 8).map((tally) => (
            <li key={tally.name}>
              <button
                type="button"
                aria-pressed={filter.tally?.kind === kind && filter.tally.name === tally.name}
                title={`${tally.name} · ${relativeTime(t, tally.lastAt)}`}
                onClick={() => onToggle(kind, tally.name)}
              >
                <span className="qc-bar-bg" style={{ width: `${(tally.count / max) * 100}%` }} />
                <span className="qc-name">{tally.name}</span>
                <span className="qc-count">{tally.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SessionTile({ session, onOpen, t }: { readonly session: SessionCard; readonly onOpen: (id: string) => void; readonly t: Translate }) {
  const share = session.contextWindow ? session.contextTokens / session.contextWindow : null
  return (
    <button type="button" className="qc-session" onClick={() => onOpen(session.id)} title={session.cwd ?? session.id}>
      <span className="qc-session-title">{session.title ?? t("untitled")}</span>
      {session.cwd ? <span className="qc-session-path">{shortPath(session.cwd)}</span> : null}
      <MiniStack cacheRead={session.cacheRead} prompt={session.prompt} output={session.output} />
      <span className="qc-session-meta">
        <span>{formatTokens(session.tokens)}</span>
        <span>{t("turnsShort", { count: session.turns })}</span>
        <span>
          {formatTokens(session.contextTokens)}
          {share !== null ? ` · ${formatPercent(share, 0)}` : ""}
        </span>
        <span>{relativeTime(t, session.lastAt)}</span>
      </span>
    </button>
  )
}

export function visibleSessions(sessions: readonly SessionCard[], filter: Filter, sort: Sort): SessionCard[] {
  const query = filter.query.trim().toLowerCase()
  const result = sessions.filter(
    (session) =>
      (!filter.day || session.days.includes(filter.day)) &&
      (!filter.tally || session[filter.tally.kind].includes(filter.tally.name)) &&
      (!query || `${session.title ?? ""} ${session.cwd ?? ""}`.toLowerCase().includes(query)),
  )
  if (sort === "tokens") result.sort((a, b) => b.tokens - a.tokens)
  else if (sort === "context") result.sort((a, b) => b.contextTokens - a.contextTokens)
  return result
}
