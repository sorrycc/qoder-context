import { Button } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type Overview, type Range, type SessionCard, type Tally } from "../shared/types.js"
import { Donut, Heatmap, longDate, MiniStack, SERIES, WeekBars } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { relativeTime, type MessageKey, type Translate } from "./i18n.js"
import {
  groupSessions,
  highlight,
  searchTerms,
  SESSION_PAGE,
  TALLY_CAP,
  visibleSessions,
  type DayLabel,
  type Filter,
  type Sort,
  type TallyKind,
} from "./lists.js"
import { enter } from "./motion.js"
import { TipBody, Tooltip, useChartTip, useHoverTip } from "./tooltip.js"
import {
  CappedList,
  Card,
  EmptyState,
  formatCount,
  Icon,
  Kpi,
  KpiSkeletons,
  Segmented,
  Skeleton,
  Spinner,
  useDebounced,
  type IconName,
} from "./ui.js"

const RANGE_LABELS: Record<Range, MessageKey> = { today: "rangeToday", "7d": "range7d", "30d": "range30d" }
const SORT_LABELS: Record<Sort, MessageKey> = { recent: "sortRecent", tokens: "sortTokens", context: "sortContext" }

registerView((context, t) => <Insights context={context} t={t} />)

function Insights({ context, t }: { readonly context: PluginViewContext; readonly t: Translate }) {
  const [range, setRange] = useState<Range>("7d")
  const overview = useLoad(
    context,
    async () => (await context.api.node.callService(SERVICE_NAME, "overview", { range }, { timeoutMs: 60_000 })) as unknown as Overview,
    range,
  )
  const data = overview.data
  const rangeOptions = useMemo(
    () => (Object.keys(RANGE_LABELS) as Range[]).map((value) => ({ value, label: t(RANGE_LABELS[value]) })),
    [t],
  )

  return (
    <>
      <header className="qc-head">
        <div className="qc-head-text">
          <h1>{t("insightsTitle")}</h1>
          <p>
            {t("insightsSubtitle")}
            {data ? <span className="qc-muted"> · {t("scanned", { count: data.scannedFiles })}</span> : null}
          </p>
        </div>
        <div className="qc-actions">
          <Segmented className="qc-range" label={t("rangeLabel")} value={range} options={rangeOptions} onChange={setRange} />
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
  const [day, setDay] = useState<string | null>(null)
  const [tally, setTally] = useState<Filter["tally"]>(null)
  const [search, setSearch] = useState("")
  const query = useDebounced(search, 150)
  const [sort, setSort] = useState<Sort>("recent")
  const [openError, setOpenError] = useState<string | null>(null)
  const filter = useMemo<Filter>(() => ({ day, tally, query }), [day, tally, query])
  const sessions = useMemo(() => visibleSessions(data.sessions, filter, sort), [data.sessions, filter, sort])
  const usage = useMemo(() => sessionsPerTally(data.sessions), [data.sessions])
  const toggleTally = useCallback(
    (kind: TallyKind, name: string) => setTally((current) => (current?.kind === kind && current.name === name ? null : { kind, name })),
    [],
  )
  const open = useCallback(
    (id: string) => {
      setOpenError(null)
      context.api.chat.revealLocalSession(id).catch(() => setOpenError(id))
    },
    [context],
  )
  const filtered = day !== null || tally !== null || query.trim() !== ""
  const clearAll = () => {
    setDay(null)
    setTally(null)
    setSearch("")
  }
  const sortOptions = useMemo(() => (Object.keys(SORT_LABELS) as Sort[]).map((value) => ({ value, label: t(SORT_LABELS[value]) })), [t])
  const tallyProps = { filter, usage, onToggle: toggleTally, t }

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
          <Heatmap cells={data.heatmap} selected={day} onSelect={setDay} locale={context.locale} t={t} />
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
        <TallyCard index={9} title={t("toolsTitle")} kind="tools" tallies={data.tools} empty={{ icon: "tool", title: t("emptyTools") }} {...tallyProps} />
        <TallyCard
          index={10}
          title={t("skillsTitle")}
          kind="skills"
          tallies={data.skills}
          empty={{ icon: "sparkle", title: t("emptySkills"), hint: t("emptySkillsHint") }}
          {...tallyProps}
        />
        <TallyCard
          index={11}
          title={t("commandsTitle")}
          kind="commands"
          tallies={data.commands}
          empty={{ icon: "terminal", title: t("emptyCommands") }}
          {...tallyProps}
        />
      </div>
      <p className="qc-note">{t("estimateNote")}</p>
      <Card
        index={12}
        className="qc-sessions-card"
        title={t("sessionsTitle")}
        aside={
          <span className="qc-badge" aria-live="polite">
            {filtered ? t("resultCount", { shown: sessions.length, total: data.sessions.length }) : sessions.length}
          </span>
        }
      >
        <div className="qc-toolbar">
          <SearchField value={search} onChange={setSearch} t={t} />
          <Segmented label={t("sortLabel")} value={sort} options={sortOptions} onChange={setSort} />
          {day || tally ? (
            <span className="qc-chip">
              <span className="qc-name">
                {t("filteredBy")}: {[day ? longDate(day, context.locale) : null, tally?.name].filter(Boolean).join(" · ")}
              </span>
              <button
                type="button"
                aria-label={t("clearFilter")}
                onClick={() => {
                  setDay(null)
                  setTally(null)
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ) : null}
        </div>
        {openError ? <p className="qc-error">{t("openFailed")}</p> : null}
        {sessions.length === 0 ? (
          <EmptyState
            icon="search"
            title={t("noSessions")}
            hint={filtered ? t("noSessionsHint") : undefined}
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>
                  {t("clearAll")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <SessionList sessions={sessions} sort={sort} query={query} locale={context.locale} onOpen={open} t={t} />
        )}
        {data.sessionsTruncated > 0 ? <p className="qc-note">{t("moreSessions", { count: data.sessionsTruncated })}</p> : null}
      </Card>
    </>
  )
}

const formatTokenValue = (value: number | null) => formatTokens(value ?? 0)
const formatRatio = (value: number | null) => formatPercent(value)

/** How many listed sessions used each tool, skill and command, keyed `kind:name`. */
function sessionsPerTally(sessions: readonly SessionCard[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    for (const kind of ["tools", "skills", "commands"] as const) {
      for (const name of session[kind]) counts.set(`${kind}:${name}`, (counts.get(`${kind}:${name}`) ?? 0) + 1)
    }
  }
  return counts
}

function SearchField({ value, onChange, t }: { readonly value: string; readonly onChange: (value: string) => void; readonly t: Translate }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="qc-search">
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={value}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault()
            onChange("")
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="qc-search-clear"
          aria-label={t("clearSearch")}
          onClick={() => {
            onChange("")
            inputRef.current?.focus()
          }}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  )
}

function TallyCard({
  index,
  title,
  kind,
  tallies,
  empty,
  filter,
  usage,
  onToggle,
  t,
}: {
  readonly index: number
  readonly title: string
  readonly kind: TallyKind
  readonly tallies: readonly Tally[]
  readonly empty: { readonly icon: IconName; readonly title: string; readonly hint?: string }
  readonly filter: Filter
  readonly usage: ReadonlyMap<string, number>
  readonly onToggle: (kind: TallyKind, name: string) => void
  readonly t: Translate
}) {
  const tip = useChartTip()
  const hover = useHoverTip(tip, 120)
  const max = Math.max(1, ...tallies.map((tally) => tally.count))
  const selected = filter.tally?.kind === kind ? tallies.findIndex((tally) => tally.name === filter.tally?.name) : -1
  const active = tip.active === null ? undefined : tallies[tip.active]
  const row = (tally: Tally, position: number) => {
    const pressed = position === selected
    return (
      <li key={tally.name}>
        <button type="button" data-qc-tip={position} aria-pressed={pressed} aria-describedby={tip.id} onClick={() => onToggle(kind, tally.name)}>
          <span className="qc-name">{tally.name}</span>
          <span className="qc-count">{tally.count.toLocaleString()}</span>
          <span className="qc-tally-bar">
            <span style={{ width: `${(tally.count / max) * 100}%`, ...enter(position) }} />
          </span>
        </button>
      </li>
    )
  }
  return (
    <Card index={index} title={title} hint={tallies.length > 0 ? tallies.length : undefined}>
      {tallies.length === 0 ? (
        <EmptyState compact icon={empty.icon} title={empty.title} hint={empty.hint} />
      ) : (
        <div className="qc-tip-host" ref={tip.hostRef} {...hover}>
          <CappedList
            className="qc-tally"
            items={tallies}
            cap={TALLY_CAP}
            render={row}
            showAll={t("showAll", { count: tallies.length })}
            showLess={t("showLess")}
            // Keep a selected row that sits past the cap in view.
            forceOpen={selected >= TALLY_CAP}
          />
          <Tooltip tip={tip}>
            {active ? (
              <TipBody
                title={active.name}
                rows={[
                  { label: t("tallyRuns"), value: active.count.toLocaleString() },
                  { label: t("tallySessions"), value: (usage.get(`${kind}:${active.name}`) ?? 0).toLocaleString() },
                  { label: t("tallyLastUsed"), value: relativeTime(t, active.lastAt) },
                ]}
                note={tip.active === selected ? t("heatClickToClear") : t("heatClickToFilter")}
              />
            ) : null}
          </Tooltip>
        </div>
      )}
    </Card>
  )
}

function SessionList({
  sessions,
  sort,
  query,
  locale,
  onOpen,
  t,
}: {
  readonly sessions: readonly SessionCard[]
  readonly sort: Sort
  readonly query: string
  readonly locale: string
  readonly onOpen: (id: string) => void
  readonly t: Translate
}) {
  const [limit, setLimit] = useState(SESSION_PAGE)
  const [shownFor, setShownFor] = useState(sessions)
  // A new result set starts again at one page.
  if (shownFor !== sessions) {
    setShownFor(sessions)
    setLimit(SESSION_PAGE)
  }
  const shown = useMemo(() => sessions.slice(0, limit), [sessions, limit])
  const groups = useMemo(() => groupSessions(shown, sort), [shown, sort])
  const terms = useMemo(() => searchTerms(query), [query])
  const remaining = sessions.length - shown.length
  const more = useCallback(() => setLimit((current) => current + SESSION_PAGE), [])
  const sentinel = useRef<HTMLDivElement | null>(null)
  const tip = useChartTip()
  const hover = useHoverTip(tip, 450)

  useEffect(() => {
    const node = sentinel.current
    if (!node || remaining <= 0 || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && more(), { rootMargin: "320px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [remaining, more, shown.length])

  let position = 0
  const active = tip.active === null ? undefined : shown[tip.active]
  return (
    <div className="qc-tip-host" ref={tip.hostRef}>
      <div {...hover}>
        {groups.map((group) => (
          <section key={group.key} className="qc-group">
            {group.label ? (
              <header className="qc-group-head">
                <span className="qc-group-title">{dayLabel(group.label, locale, t)}</span>
                <span className="qc-badge">{group.sessions.length}</span>
                <span className="qc-group-tokens">{formatTokens(group.tokens)}</span>
              </header>
            ) : null}
            <div className="qc-sessions">
              {group.sessions.map((session) => {
                const at = position++
                return <SessionTile key={session.id} index={at} session={session} terms={terms} onOpen={onOpen} t={t} />
              })}
            </div>
          </section>
        ))}
      </div>
      {remaining > 0 ? (
        <div ref={sentinel} className="qc-more-row">
          <button type="button" className="qc-more" onClick={more}>
            {t("showMore", { count: Math.min(SESSION_PAGE, remaining) })}
            <Icon name="chevron" size={12} />
          </button>
        </div>
      ) : null}
      <Tooltip tip={tip}>{active ? <SessionTip session={active} locale={locale} t={t} /> : null}</Tooltip>
    </div>
  )
}

function dayLabel(label: DayLabel, locale: string, t: Translate): string {
  if (label.kind === "date") return longDate(label.day, locale)
  return t(label.kind === "today" ? "rangeToday" : "yesterday")
}

function Highlighted({ text, terms }: { readonly text: string; readonly terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="qc-mark">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  )
}

const SessionTile = memo(function SessionTile({
  index,
  session,
  terms,
  onOpen,
  t,
}: {
  readonly index: number
  readonly session: SessionCard
  readonly terms: readonly string[]
  readonly onOpen: (id: string) => void
  readonly t: Translate
}) {
  const share = session.contextWindow ? session.contextTokens / session.contextWindow : null
  return (
    <button type="button" className="qc-session qc-pressable qc-enter" style={enter(index % SESSION_PAGE)} data-qc-tip={index} onClick={() => onOpen(session.id)}>
      <span className="qc-session-title">
        <Highlighted text={session.title ?? t("untitled")} terms={terms} />
      </span>
      {session.cwd ? (
        <span className="qc-session-path">
          <Highlighted text={shortPath(session.cwd)} terms={terms} />
        </span>
      ) : null}
      <MiniStack cacheRead={session.cacheRead} prompt={session.prompt} output={session.output} />
      <span className="qc-session-meta">
        <span>{formatTokens(session.tokens)}</span>
        <span>{t("turnsShort", { count: session.turns })}</span>
        <span data-tone={share !== null && share >= 0.8 ? (share >= 0.95 ? "danger" : "warning") : undefined}>
          {formatTokens(session.contextTokens)}
          {share !== null ? ` · ${formatPercent(share, 0)}` : ""}
        </span>
        <span>{relativeTime(t, session.lastAt)}</span>
      </span>
    </button>
  )
})

function SessionTip({ session, locale, t }: { readonly session: SessionCard; readonly locale: string; readonly t: Translate }) {
  const share = session.contextWindow ? session.contextTokens / session.contextWindow : null
  return (
    <TipBody
      title={session.title ?? t("untitled")}
      rows={[
        { label: t("cacheRead"), value: formatTokens(session.cacheRead), color: SERIES.cacheRead },
        { label: t("uncached"), value: formatTokens(Math.max(0, session.prompt - session.cacheRead)), color: SERIES.uncached },
        { label: t("output"), value: formatTokens(session.output), color: SERIES.output },
        { label: t("kpiRequests"), value: session.requests.toLocaleString() },
        {
          label: t("contextNow"),
          value: `${formatTokens(session.contextTokens)}${share !== null ? ` · ${formatPercent(share, 0)}` : ""}`,
        },
        { label: t("lastActive"), value: new Date(session.lastAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) },
      ]}
      note={
        <>
          {session.cwd ? <div className="qc-tip-path">{session.cwd}</div> : null}
          {t("openHint")}
        </>
      }
    />
  )
}
