import { Button } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { memo, useMemo, useRef, type ReactNode } from "react"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type ContextEvent, type FileActivity, type SessionDetail, type SessionResponse, type Tally } from "../shared/types.js"
import { ContextRing, Legend, RequestTrend, SERIES } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { formatDuration, relativeTime, type MessageKey, type Translate } from "./i18n.js"
import { TALLY_CAP } from "./lists.js"
import { enter } from "./motion.js"
import { contextGauge, splitPath, timeline, type Gauge, type TimelineItem } from "./session-model.js"
import { TipBody, Tooltip, useChartTip, useHoverTip } from "./tooltip.js"
import {
  AnimatedNumber,
  CappedList,
  Card,
  contextTone,
  EmptyState,
  formatCount,
  Icon,
  Kpi,
  KpiSkeletons,
  Skeleton,
  useNow,
  type IconName,
} from "./ui.js"

type Loaded = Exclude<SessionResponse, { status: "unchanged" }>
type Ok = Extract<SessionResponse, { status: "ok" }>

const POLL_MS = 15_000
/** Events shown before "Show all". */
const EVENT_CAP = 5
const TRIGGERS: Record<"manual" | "auto" | "unknown", MessageKey> = { manual: "triggerManual", auto: "triggerAuto", unknown: "triggerUnknown" }

registerView((context, t) => <SessionContext context={context} t={t} />, { compact: true })

function SessionContext({ context, t }: { readonly context: PluginViewContext; readonly t: Translate }) {
  const sessionId = context.sourceSessionId
  // The last full response for this session; polls send its version and get "unchanged" back while
  // the transcript is untouched, so the view keeps the same objects and nothing below re-renders.
  const last = useRef<{ readonly sessionId: typeof sessionId; readonly response: Ok } | null>(null)
  const response = useLoad(
    context,
    async (): Promise<{ readonly response: Loaded; readonly checkedAt: number }> => {
      const known = last.current?.sessionId === sessionId ? last.current.response : null
      const call = (version?: string) =>
        context.api.node.callService(SERVICE_NAME, "session", { ...(sessionId ? { sessionId } : {}), ...(version ? { version } : {}) }, { timeoutMs: 60_000 }) as unknown as Promise<SessionResponse>
      let result = await call(known?.version)
      if (result.status === "unchanged") result = known ?? (await call())
      if (result.status === "unchanged") throw new Error("unexpected unchanged response")
      last.current = result.status === "ok" ? { sessionId, response: result } : null
      return { response: result, checkedAt: Date.now() }
    },
    sessionId ?? "",
    POLL_MS,
  )
  const data = response.data?.response
  const detail = data?.status === "ok" ? data.detail : null

  return (
    <>
      <Header
        detail={detail}
        checkedAt={response.data?.checkedAt ?? null}
        loading={response.loading}
        failed={response.error && data !== undefined}
        onRefresh={response.reload}
        t={t}
      />
      {response.error && !data ? (
        <EmptyState
          icon="alert"
          title={t("loadFailed")}
          hint={t("loadFailedHint")}
          action={
            <Button variant="secondary" size="sm" onClick={response.reload}>
              {t("retry")}
            </Button>
          }
        />
      ) : !data ? (
        <Placeholder />
      ) : data.status !== "ok" ? (
        data.status === "unbound" ? (
          <EmptyState icon="gauge" title={t("unbound")} />
        ) : (
          <EmptyState icon="inbox" title={t("missing")} hint={t("missingHint")} />
        )
      ) : (
        <Detail detail={data.detail} t={t} />
      )}
    </>
  )
}

function Placeholder() {
  return (
    <div aria-hidden="true">
      <div className="qc-grid qc-hero">
        <Skeleton height={176} />
        <KpiSkeletons count={8} />
      </div>
      <Skeleton height={226} />
      <div className="qc-grid qc-pairs" style={{ marginTop: "var(--qc-space-3)" }}>
        <Skeleton height={180} />
        <Skeleton height={180} />
      </div>
    </div>
  )
}

function Header({
  detail,
  checkedAt,
  loading,
  failed,
  onRefresh,
  t,
}: {
  readonly detail: SessionDetail | null
  readonly checkedAt: number | null
  readonly loading: boolean
  readonly failed: boolean
  readonly onRefresh: () => void
  readonly t: Translate
}) {
  const now = useNow(10_000)
  const summary = detail?.summary
  const tip = useChartTip()
  const hover = useHoverTip(tip, 300)
  const facts = summary
    ? ([
        summary.cwd ? { icon: "folder", label: t("factFolder"), short: shortPath(summary.cwd), full: summary.cwd } : null,
        summary.model ? { icon: "chip", label: t("factModel"), short: summary.model, full: summary.model } : null,
        summary.gitBranch ? { icon: "branch", label: t("factBranch"), short: summary.gitBranch, full: summary.gitBranch } : null,
      ].filter(Boolean) as { icon: IconName; label: string; short: string; full: string }[])
    : []
  const active = tip.active === null ? undefined : facts[tip.active]
  return (
    <header className="qc-head qc-session-head">
      <div className="qc-head-text">
        <h1 className="qc-name">{summary?.title ?? t("sessionTitle")}</h1>
        {facts.length > 0 ? (
          <div className="qc-tip-host qc-facts" ref={tip.hostRef} {...hover}>
            {facts.map((fact, index) => (
              <span key={fact.icon} className="qc-fact" tabIndex={0} data-qc-tip={index} aria-describedby={tip.id}>
                <Icon name={fact.icon} size={12} />
                <span className="qc-name">{fact.short}</span>
              </span>
            ))}
            <Tooltip tip={tip}>{active ? <TipBody title={active.label} rows={[]} note={active.full} /> : null}</Tooltip>
          </div>
        ) : null}
      </div>
      <div className="qc-actions">
        {checkedAt !== null ? (
          <span className="qc-live" data-state={failed ? "failed" : "live"} aria-live="polite">
            <i />
            {failed ? t("refreshFailed") : t("liveUpdated", { time: relativeTime(t, checkedAt, now) })}
          </span>
        ) : null}
        <button type="button" className="qc-icon-button" aria-label={t("refresh")} disabled={loading} onClick={onRefresh} data-busy={loading || undefined}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
    </header>
  )
}

const Detail = memo(function Detail({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { summary } = detail
  const gauge = useMemo(() => contextGauge(detail), [detail])
  return (
    <>
      <div className="qc-grid qc-hero">
        <ContextCard gauge={gauge} t={t} />
        <div className="qc-grid qc-kpis">
          <Kpi index={1} label={t("statTurns")} value={summary.turns} format={formatCount} />
          <Kpi index={2} label={t("statRequests")} value={summary.requests} format={formatCount} />
          <Kpi index={3} label={t("statTokens")} value={summary.tokens.prompt + summary.tokens.output} format={formatTokenValue} tone="accent" />
          <Kpi
            index={4}
            label={t("statCacheHit")}
            value={summary.tokens.prompt > 0 ? summary.tokens.cacheRead / summary.tokens.prompt : null}
            format={formatRatio}
            tone="success"
          />
          <Kpi
            index={5}
            label={t("statToolRuns")}
            value={summary.toolRuns}
            format={formatCount}
            tone={summary.toolErrors > 0 ? "danger" : "neutral"}
            sub={summary.toolErrors > 0 ? t("statToolErrors", { count: summary.toolErrors }) : undefined}
          />
          <Kpi
            index={6}
            label={t("statCompactions")}
            value={summary.compactions}
            format={formatCount}
            tone={summary.compactions > 0 ? "warning" : "neutral"}
          />
          <Kpi index={7} label={t("statSubagents")} value={summary.subagents} format={formatCount} />
          <Kpi index={8} label={t("statSpan")} value={summary.lastAt - summary.firstAt} format={formatDuration} />
        </div>
      </div>
      <Card
        index={9}
        className="qc-stack-gap"
        title={t("trendTitle")}
        hint={
          detail.requestsTruncated > 0
            ? t("trendTruncated", { shown: detail.requests.length, total: detail.requests.length + detail.requestsTruncated })
            : t("trendHint")
        }
      >
        <RequestTrend requests={detail.requests} events={detail.events} offset={detail.requestsTruncated} window={summary.contextWindow} t={t} />
        <Legend t={t} window={summary.contextWindow} compactions={detail.events.some((event) => event.kind === "compaction")} />
      </Card>
      <div className="qc-grid qc-pairs">
        <Events events={detail.events} t={t} />
        <Files files={detail.files} t={t} />
        <TallyCard index={12} title={t("toolsTitle")} tallies={summary.tools} empty={{ icon: "tool", title: t("emptySessionTools") }} t={t} />
        <TallyCard index={13} title={t("commandsTitle")} tallies={summary.commands} empty={{ icon: "terminal", title: t("emptySessionCommands") }} t={t} />
      </div>
    </>
  )
})

const formatTokenValue = (value: number | null) => formatTokens(value ?? 0)
const formatRatio = (value: number | null) => formatPercent(value)

function ContextCard({ gauge, t }: { readonly gauge: Gauge; readonly t: Translate }) {
  const tone = contextTone(gauge.ratio)
  const scale = gauge.window ?? Math.max(gauge.used, 1)
  const label = gauge.window
    ? t("ringLabel", { used: formatTokens(gauge.used), window: formatTokens(gauge.window) })
    : `${formatTokens(gauge.used)} · ${t("windowUnknown")}`
  return (
    <Card index={0} className="qc-context-card" title={t("currentTitle")}>
      <div className="qc-context" data-tone={tone}>
        <ContextRing cached={gauge.cached} uncached={gauge.uncached} scale={scale} label={label} warn={tone !== "neutral"}>
          {gauge.ratio !== null ? (
            <>
              <span className="qc-ring-value">
                <AnimatedNumber value={gauge.ratio * 100} format={formatShare} />
              </span>
              <span className="qc-ring-caption">{t("ofWindow", { window: formatTokens(gauge.window ?? 0) })}</span>
            </>
          ) : (
            <>
              <span className="qc-ring-value">
                <AnimatedNumber value={gauge.used} format={formatTokenValue} />
              </span>
              <span className="qc-ring-caption">{t("windowUnknown")}</span>
            </>
          )}
        </ContextRing>
        <dl className="qc-context-stats">
          <Stat label={t("usedNow")}>
            <AnimatedNumber value={gauge.used} format={formatTokenValue} />
          </Stat>
          {gauge.headroom !== null ? (
            <Stat label={t("headroom")} tone={tone}>
              {gauge.headroom > 0 ? (
                <AnimatedNumber value={gauge.headroom} format={formatTokenValue} />
              ) : (
                t("windowFull")
              )}
            </Stat>
          ) : null}
          <Stat label={t("cacheRead")} color={SERIES.cacheRead}>
            <AnimatedNumber value={gauge.cached} format={formatTokenValue} />
          </Stat>
          <Stat label={t("uncached")} color={SERIES.uncached}>
            <AnimatedNumber value={gauge.uncached} format={formatTokenValue} />
          </Stat>
          {gauge.growth !== null ? (
            <Stat label={t("pace")}>{t("paceValue", { tokens: formatTokens(gauge.growth) })}</Stat>
          ) : null}
        </dl>
      </div>
      {gauge.requestsLeft !== null && gauge.headroom ? (
        <p className="qc-context-note" data-tone={tone}>
          {tone === "neutral" ? t("requestsLeft", { count: gauge.requestsLeft.toLocaleString() }) : t("nearFull", { count: gauge.requestsLeft.toLocaleString() })}
        </p>
      ) : null}
    </Card>
  )
}

const formatShare = (value: number | null) => `${(value ?? 0).toFixed(1)}%`

function Stat({ label, tone, color, children }: { readonly label: string; readonly tone?: string; readonly color?: string; readonly children: ReactNode }) {
  return (
    <div data-tone={tone}>
      <dt>
        {color ? <i className="qc-swatch" style={{ background: color }} /> : null}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

const EVENT_ICONS: Record<ContextEvent["kind"], IconName> = { compaction: "scissors", retry: "refresh", error: "alert" }
const EVENT_TONES: Record<ContextEvent["kind"], string> = { compaction: "warning", retry: "neutral", error: "danger" }

function Events({ events, t }: { readonly events: readonly ContextEvent[]; readonly t: Translate }) {
  const items = useMemo(() => timeline(events), [events])
  const now = useNow(30_000)
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const active = tip.active === null ? undefined : items[tip.active]
  const row = (item: TimelineItem, position: number) => (
    <li key={item.key} className="qc-enter" style={enter(position % EVENT_CAP)} data-tone={EVENT_TONES[item.event.kind]} data-qc-tip={position} tabIndex={0} aria-describedby={tip.id}>
      <span className="qc-timeline-node">
        <Icon name={EVENT_ICONS[item.event.kind]} size={12} />
      </span>
      <span className="qc-timeline-body">
        <span className="qc-timeline-title">
          <span className="qc-name">{eventTitle(item.event, t)}</span>
          {item.count > 1 ? <span className="qc-badge">×{item.count}</span> : null}
          <time className="qc-timeline-time">{relativeTime(t, item.event.at, now)}</time>
        </span>
        <span className="qc-timeline-detail">{eventDetail(item.event)}</span>
      </span>
    </li>
  )
  return (
    <Card index={10} title={t("eventsTitle")} hint={items.length > 0 ? events.length : undefined}>
      {items.length === 0 ? (
        <EmptyState compact icon="sparkle" title={t("eventsEmpty")} hint={t("eventsEmptyHint")} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList
            className="qc-timeline"
            items={items}
            cap={EVENT_CAP}
            render={row}
            showAll={t("showAll", { count: items.length })}
            showLess={t("showLess")}
          />
          <Tooltip tip={tip}>{active ? <EventTip item={active} t={t} /> : null}</Tooltip>
        </div>
      )}
    </Card>
  )
}

function eventTitle(event: ContextEvent, t: Translate): string {
  if (event.kind === "compaction") return t("compaction", { trigger: t(TRIGGERS[event.trigger]) })
  return t(event.kind === "retry" ? "retryEvent" : "errorEvent")
}

function eventDetail(event: ContextEvent): string {
  if (event.kind !== "compaction") return event.text
  const tokens = (value: number | null) => (value === null ? "?" : formatTokens(value))
  return `${tokens(event.preTokens)} → ${tokens(event.postTokens)}${event.durationMs !== null ? ` · ${formatDuration(event.durationMs)}` : ""}`
}

function EventTip({ item, t }: { readonly item: TimelineItem; readonly t: Translate }) {
  const { event } = item
  const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
  const rows: { label: string; value: string }[] = [
    { label: t("eventWhen"), value: when(event.at) },
    { label: t("eventPosition"), value: event.requestIndex > 0 ? t("afterRequest", { index: event.requestIndex }) : t("sessionStart") },
  ]
  if (event.kind === "compaction") {
    if (event.preTokens !== null) rows.push({ label: t("compactBefore"), value: formatTokens(event.preTokens) })
    if (event.postTokens !== null) rows.push({ label: t("compactAfter"), value: formatTokens(event.postTokens) })
    if (event.preTokens !== null && event.postTokens !== null) {
      rows.push({ label: t("compactFreed"), value: formatTokens(Math.max(0, event.preTokens - event.postTokens)) })
    }
    if (event.durationMs !== null) rows.push({ label: t("compactTook"), value: formatDuration(event.durationMs) })
  } else if (item.count > 1) {
    rows.push({ label: t("occurrences"), value: item.count.toLocaleString() }, { label: t("eventFirst"), value: when(item.firstAt) })
  }
  return <TipBody title={eventTitle(event, t)} rows={rows} note={event.kind === "compaction" ? undefined : event.text} />
}

function Files({ files, t }: { readonly files: readonly FileActivity[]; readonly t: Translate }) {
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const max = Math.max(1, ...files.map((file) => file.reads + file.writes))
  const active = tip.active === null ? undefined : files[tip.active]
  const row = (file: FileActivity, position: number) => {
    const { name, dir } = splitPath(file.path)
    return (
      <li key={file.path} className="qc-row" tabIndex={0} data-qc-tip={position} aria-describedby={tip.id}>
        <span className="qc-name">
          {name}
          {dir ? <span className="qc-row-dir"> {dir}</span> : null}
        </span>
        <span className="qc-count">
          {file.writes > 0 ? <span className="qc-write-count">{t("writesShort", { count: file.writes })}</span> : null}
          {file.reads > 0 ? <span>{t("readsShort", { count: file.reads })}</span> : null}
        </span>
        <span className="qc-tally-bar qc-split-bar">
          <span style={{ width: `${(file.writes / max) * 100}%`, background: SERIES.output, ...enter(position) }} />
          <span style={{ width: `${(file.reads / max) * 100}%`, ...enter(position) }} />
        </span>
      </li>
    )
  }
  return (
    <Card
      index={11}
      title={t("filesTitle")}
      hint={files.length > 0 ? files.length : undefined}
      aside={
        files.length > 0 ? (
          <span className="qc-legend qc-legend-inline">
            <span>
              <i className="qc-swatch" style={{ background: SERIES.output }} />
              {t("filesWritten")}
            </span>
            <span>
              <i className="qc-swatch qc-swatch-read" />
              {t("filesRead")}
            </span>
          </span>
        ) : undefined
      }
    >
      {files.length === 0 ? (
        <EmptyState compact icon="file" title={t("emptyFiles")} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList className="qc-tally" items={files} cap={TALLY_CAP} render={row} showAll={t("showAll", { count: files.length })} showLess={t("showLess")} />
          <Tooltip tip={tip}>
            {active ? (
              <TipBody
                title={splitPath(active.path).name}
                rows={[
                  { label: t("filesWritten"), value: active.writes.toLocaleString(), color: SERIES.output },
                  { label: t("filesRead"), value: active.reads.toLocaleString(), color: "var(--qc-read)" },
                  { label: t("tallyLastUsed"), value: relativeTime(t, active.lastAt) },
                ]}
                note={active.path}
              />
            ) : null}
          </Tooltip>
        </div>
      )}
    </Card>
  )
}

function TallyCard({
  index,
  title,
  tallies,
  empty,
  t,
}: {
  readonly index: number
  readonly title: string
  readonly tallies: readonly Tally[]
  readonly empty: { readonly icon: IconName; readonly title: string }
  readonly t: Translate
}) {
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const max = Math.max(1, ...tallies.map((tally) => tally.count))
  const total = tallies.reduce((sum, tally) => sum + tally.count, 0)
  const active = tip.active === null ? undefined : tallies[tip.active]
  const row = (tally: Tally, position: number) => (
    <li key={tally.name} className="qc-row" tabIndex={0} data-qc-tip={position} aria-describedby={tip.id}>
      <span className="qc-name">{tally.name}</span>
      <span className="qc-count">{tally.count.toLocaleString()}</span>
      <span className="qc-tally-bar">
        <span style={{ width: `${(tally.count / max) * 100}%`, ...enter(position) }} />
      </span>
    </li>
  )
  return (
    <Card index={index} title={title} hint={tallies.length > 0 ? tallies.length : undefined}>
      {tallies.length === 0 ? (
        <EmptyState compact icon={empty.icon} title={empty.title} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList className="qc-tally" items={tallies} cap={TALLY_CAP} render={row} showAll={t("showAll", { count: tallies.length })} showLess={t("showLess")} />
          <Tooltip tip={tip}>
            {active ? (
              <TipBody
                title={active.name}
                rows={[
                  { label: t("tallyRuns"), value: active.count.toLocaleString() },
                  { label: t("tallyShare"), value: formatPercent(total > 0 ? active.count / total : null, 0) },
                  { label: t("tallyLastUsed"), value: relativeTime(t, active.lastAt) },
                ]}
              />
            ) : null}
          </Tooltip>
        </div>
      )}
    </Card>
  )
}
