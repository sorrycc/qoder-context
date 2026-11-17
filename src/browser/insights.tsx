import { Button, Input } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { useMemo, useState } from "react"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type Overview, type Range, type SessionCard, type Tally } from "../shared/types.js"
import { Donut, Heatmap, MiniStack, SERIES, WeekBars } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { relativeTime, type MessageKey, type Translate } from "./i18n.js"
import { enter } from "./motion.js"
import { Card, formatCount, Kpi, KpiSkeletons, Skeleton, Spinner } from "./ui.js"

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
            <span className="qc-button-label">
              {overview.loading && data ? <Spinner /> : null}
              {overview.loading && data ? t("loading") : t("refresh")}
            </span>
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
      <KpiSkeletons count={6} />
      <div className="qc-grid qc-two">
        <Skeleton height={190} />
        <Skeleton height={190} />
      </div>
      <div className="qc-grid qc-four">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={160} />
        ))}
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
        <Kpi index={0} label={t("kpiSessions")} value={data.kpi.sessions} format={formatCount} />
        <Kpi index={1} label={t("kpiTokens")} value={data.kpi.tokens} format={formatTokenValue} tone="accent" />
        <Kpi index={2} label={t("kpiCacheHit")} value={data.kpi.cacheHitRate} format={formatRatio} tone="success" />
        <Kpi index={3} label={t("kpiTurns")} value={data.kpi.turns} format={formatCount} />
        <Kpi index={4} label={t("kpiRequests")} value={data.kpi.requests} format={formatCount} />
        <Kpi index={5} label={t("kpiToolRuns")} value={data.kpi.toolRuns} format={formatCount} />
      </div>
      <div className="qc-grid qc-two">
        <Card index={6} title={t("weekTitle")}>
          <WeekBars days={data.week} locale={context.locale} t={t} />
        </Card>
        <Card index={7} title={t("heatmapTitle")} hint={t("heatmapHint")}>
          <Heatmap
            cells={data.heatmap}
            selected={filter.day}
            onSelect={(day) => setFilter((current) => ({ ...current, day }))}
            locale={context.locale}
            t={t}
          />
        </Card>
      </div>
      <div className="qc-grid qc-four">
        <Card index={8} title={t("compositionTitle")}>
          <Donut
            t={t}
            parts={[
              { label: t("cacheRead"), value: data.composition.cacheRead, color: SERIES.cacheRead },
              { label: t("uncached"), value: data.composition.uncached, color: SERIES.uncached },
              { label: t("output"), value: data.composition.output, color: SERIES.output },
            ]}
          />
        </Card>
        <TallyCard index={9} title={t("toolsTitle")} kind="tools" tallies={data.tools} filter={filter} onToggle={toggleTally} t={t} />
        <TallyCard index={10} title={t("skillsTitle")} kind="skills" tallies={data.skills} filter={filter} onToggle={toggleTally} t={t} />
        <TallyCard index={11} title={t("commandsTitle")} kind="commands" tallies={data.commands} filter={filter} onToggle={toggleTally} t={t} />
      </div>
      <p className="qc-note">{t("estimateNote")}</p>
      <Card index={12} title={t("sessionsTitle")} aside={<span className="qc-badge">{sessions.length}</span>}>
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
            {sessions.map((session, index) => (
              <SessionTile key={session.id} index={index} session={session} onOpen={open} t={t} />
            ))}
          </div>
        )}
        {data.sessionsTruncated > 0 ? <p className="qc-note">{t("moreSessions", { count: data.sessionsTruncated })}</p> : null}
      </Card>
    </>
  )
}

const formatTokenValue = (value: number | null) => formatTokens(value ?? 0)
const formatRatio = (value: number | null) => formatPercent(value)

function TallyCard({
  index,
  title,
  kind,
  tallies,
  filter,
  onToggle,
  t,
}: {
  readonly index: number
  readonly title: string
  readonly kind: TallyKind
  readonly tallies: readonly Tally[]
  readonly filter: Filter
  readonly onToggle: (kind: TallyKind, name: string) => void
  readonly t: Translate
}) {
  const max = Math.max(1, ...tallies.map((tally) => tally.count))
  return (
    <Card index={index} title={title} hint={tallies.length > 0 ? tallies.length : undefined}>
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
    </Card>
  )
}

function SessionTile({
  index,
  session,
  onOpen,
  t,
}: {
  readonly index: number
  readonly session: SessionCard
  readonly onOpen: (id: string) => void
  readonly t: Translate
}) {
  const share = session.contextWindow ? session.contextTokens / session.contextWindow : null
  return (
    <button type="button" className="qc-session qc-pressable qc-enter" style={enter(index)} onClick={() => onOpen(session.id)} title={session.cwd ?? session.id}>
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
