import { useEffect, useMemo, useState } from 'react'
import { VERDICT_LABEL, type Analysis, type AnalysisRow, type Verdict } from '../lib/classify'
import { formatDateTime, formatDistance, formatDistanceDiff, formatDuration, formatDurationDiff } from '../lib/format'
import { legendShape, SELECTED_COLOR } from '../map/markers'
import { useAnalysis, useStore } from '../store'
import type { StationType } from '../types'
import { STATION_TYPES, STATION_TYPE_KEYS } from '../types'
import Icon from './Icon'

const delay = (i: number) => ({ '--i': i }) as React.CSSProperties

export default function AnalysisPanel() {
  const dest = useStore((s) => s.dest)
  const limitMin = useStore((s) => s.limitMin)
  const analysis = useAnalysis()

  if (!dest)
    return (
      <div className="flex flex-col gap-4 p-5">
        <span className="eyebrow self-start">
          <Icon name="map-point-linear" size={13} />
          시작하기
        </span>
        <h2 className="text-[22px] leading-snug font-semibold tracking-tight text-balance">
          어디까지 30분 안에
          <br />
          도착할 수 있을까요?
        </h2>
        <ol className="flex flex-col gap-2.5 text-sm text-dim">
          {[
            ['cursor-linear', '지도에서 관서 마커나 아무 지점을 누르세요.'],
            ['magnifer-linear', '또는 왼쪽에서 관서·주소·장소를 검색하세요.'],
            ['play-linear', '분석 실행을 누르면 다른 관서에서 그곳까지의 실제 도로 이동시간을 계산합니다.'],
          ].map(([icon, text], i) => (
            <li key={i} className="flex gap-3 rounded-2xl bg-elev px-3.5 py-3 ring-1 ring-line">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-fg">
                <Icon name={icon} size={14} />
              </span>
              <span className="leading-relaxed">{text}</span>
            </li>
          ))}
        </ol>
        <Disclaimer />
      </div>
    )

  const computedAt = analysis.rows.reduce<string | null>((m, r) => (r.result && (!m || r.result.computedAt > m) ? r.result.computedAt : m), null)

  return (
    <div className="flex flex-col gap-5 p-4">
      <DestHeader />
      <StatCards analysis={analysis} limitMin={limitMin} />
      <TimeHistogram analysis={analysis} limitMin={limitMin} />
      <ResultTable rows={analysis.rows} limitMin={limitMin} />
      <p className="flex items-center gap-1.5 text-[11px] text-mute">
        <Icon name="clock-circle-linear" size={13} />
        마지막 계산 {formatDateTime(computedAt)} · 카카오모빌리티 자동차 길찾기 최단시간(TIME) 기준
      </p>
      <Disclaimer />
    </div>
  )
}

function DestHeader() {
  const dest = useStore((s) => s.dest)!
  const clearDest = useStore((s) => s.clearDest)
  const command = useStore((s) => s.command)
  const st = dest.stationType ? STATION_TYPES[dest.stationType] : null
  return (
    <div className="reveal flex items-start justify-between gap-3" style={delay(0)}>
      <div className="min-w-0">
        <span className="eyebrow eyebrow-accent">
          <Icon name="map-point-wave-bold-duotone" size={13} />
          분석 목적지 · {st ? st.label : '지도에서 선택한 지점'}
        </span>
        <h2 className="mt-2.5 truncate text-[20px] leading-snug font-semibold tracking-tight">{dest.name}</h2>
        <p className="truncate text-xs text-dim">{dest.address || `${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)}`}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" className="btn-secondary h-8 w-8 p-0" title="목적지로 지도 이동" onClick={() => command('focusDest')}>
          <Icon name="target-linear" size={15} />
        </button>
        <button type="button" className="btn-secondary h-8 w-8 p-0" title="목적지 해제" onClick={clearDest}>
          <Icon name="close-circle-linear" size={15} />
        </button>
      </div>
    </div>
  )
}

/** 벤토 배치 — 핵심 숫자(기준 이내 도착)를 가장 크게 */
function StatCards({ analysis, limitMin }: { analysis: Analysis; limitMin: number }) {
  const { stats } = analysis
  const nearest = stats.nearest
  const set = useStore((s) => s.set)
  const command = useStore((s) => s.command)
  return (
    <div className="reveal" style={delay(1)}>
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-4 row-span-2 flex flex-col justify-between rounded-[1.25rem] bg-fg p-4 text-bg">
          <div className="flex items-center gap-1.5 text-xs font-medium text-bg/60">
            <Icon name="check-circle-bold" size={14} />
            {limitMin}분 이내 도착 가능
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-[56px] leading-none font-bold tracking-[-0.04em] tabular-nums">{stats.within}</span>
            <span className="text-base font-medium text-bg/60">/ {stats.targets}곳</span>
          </div>
        </div>
        <div className="stat col-span-2">
          <div className="stat-label">분석 대상</div>
          <div className="text-xl font-semibold tabular-nums">
            {stats.targets}
            <span className="ml-0.5 text-xs font-normal text-mute">곳</span>
          </div>
        </div>
        <div className="stat col-span-2">
          <div className="stat-label">기준 초과</div>
          <div className="text-xl font-semibold tabular-nums">
            {stats.over}
            <span className="ml-0.5 text-xs font-normal text-mute">곳</span>
          </div>
        </div>
        {STATION_TYPE_KEYS.map((t) => (
          <div key={t} className="stat col-span-2">
            <div className="stat-label flex items-center gap-1.5">
              <span dangerouslySetInnerHTML={{ __html: legendShape(t, undefined, 13) }} />
              {STATION_TYPES[t].short}
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {stats.withinByType[t]}
              <span className="ml-0.5 text-xs font-normal text-mute">곳</span>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="stat group col-span-6 flex items-center gap-3 text-left transition-colors duration-500 ease-spring hover:bg-hover disabled:cursor-default"
          disabled={!nearest}
          onClick={() => {
            if (!nearest) return
            set({ focusId: nearest.station.id })
            command('focusStation', [nearest.station.id])
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
            <Icon name="flag-linear" size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="stat-label block">가장 가까운 출발 관서</span>
            <span className="block truncate text-sm font-semibold">{nearest ? nearest.station.name : '—'}</span>
          </span>
          {nearest && (
            <span className="text-right">
              <span className="block text-sm font-semibold tabular-nums">{formatDuration(nearest.result?.durationSec)}</span>
              <span className="block text-[11px] text-mute tabular-nums">{formatDistance(nearest.result?.distanceM)}</span>
            </span>
          )}
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-dim">
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
          분석 불가 <b className="font-semibold tabular-nums text-fg">{stats.failed}</b>
        </span>
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1" title="직선거리만으로도 기준시간 안에 닿을 수 없어 길찾기를 호출하지 않은 관서">
          권역 밖(미계산) <b className="font-semibold tabular-nums text-fg">{stats.skipped}</b>
        </span>
        {stats.pending > 0 && (
          <span className="rounded-full bg-warn/10 px-2.5 py-1 text-warn">
            미계산 <b className="font-semibold tabular-nums">{stats.pending}</b>
          </span>
        )}
      </div>
    </div>
  )
}

function TimeHistogram({ analysis, limitMin }: { analysis: Analysis; limitMin: number }) {
  const bins = analysis.stats.histogram
  const max = Math.max(1, ...bins.map((b) => b.count))
  const total = bins.reduce((n, b) => n + b.count, 0)
  if (total === 0) return null
  return (
    <section className="reveal rounded-[1.25rem] bg-elev p-4 ring-1 ring-line" style={delay(2)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="panel-h">이동시간대별 분포</h3>
        <span className="flex items-center gap-3 text-[11px] text-mute">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-fg" />
            {limitMin}분 이내
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-white/15" />
            초과
          </span>
        </span>
      </div>
      <div className="flex h-28 items-end gap-1" role="img" aria-label="이동시간대별 관서 수 막대그래프">
        {bins.map((b) => {
          const within = b.to != null && b.to <= limitMin
          return (
            <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end" title={`${b.label}분: ${b.count}곳`}>
              {b.count > 0 && <span className="mb-1 text-[10px] tabular-nums text-dim">{b.count}</span>}
              <div
                className={`w-full rounded-md transition-[height] duration-700 ease-spring ${within ? 'bg-fg' : 'bg-white/15'}`}
                style={{ height: `${(b.count / max) * 78}%`, minHeight: b.count ? 3 : 0 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {bins.map((b) => (
          <div key={b.label} className="flex-1 text-center text-[9px] tabular-nums text-mute">
            {b.to == null ? b.label : b.to}
          </div>
        ))}
      </div>
    </section>
  )
}

const VERDICT_STYLE: Record<Verdict, string> = {
  within: 'bg-ok/10 text-ok',
  over: 'bg-white/[0.05] text-mute',
  failed: 'bg-warn/10 text-warn',
  skipped: 'bg-white/[0.03] text-mute',
  pending: 'bg-white/[0.03] text-mute',
}

function ResultTable({ rows, limitMin }: { rows: AnalysisRow[]; limitMin: number }) {
  const [typeFilter, setTypeFilter] = useState<StationType | ''>('')
  const [onlyWithin, setOnlyWithin] = useState(true)
  const focusId = useStore((s) => s.focusId)
  const paths = useStore((s) => s.paths)
  const pathLoading = useStore((s) => s.pathLoading)
  const pathError = useStore((s) => s.pathError)
  const showAllPaths = useStore((s) => s.showAllPaths)
  const set = useStore((s) => s.set)
  const loadPath = useStore((s) => s.loadPath)
  const clearPaths = useStore((s) => s.clearPaths)
  const command = useStore((s) => s.command)

  const shown = useMemo(
    () => rows.filter((r) => (!typeFilter || r.station.type === typeFilter) && (!onlyWithin || r.verdict === 'within')),
    [rows, typeFilter, onlyWithin],
  )
  const withinIds = useMemo(() => rows.filter((r) => r.verdict === 'within').map((r) => r.station.id), [rows])

  // "가능 관서 경로 모두 보기" — 아직 없는 경로를 하나씩 불러온다
  useEffect(() => {
    if (!showAllPaths) return
    let stop = false
    ;(async () => {
      for (const id of withinIds) {
        if (stop || !useStore.getState().showAllPaths) break
        await loadPath(id)
      }
    })()
    return () => {
      stop = true
    }
  }, [showAllPaths, withinIds, loadPath])

  let rank = 0
  // 2~10순위는 1순위와의 차이를 함께 보여 준다. 기준은 지금 표에 보이는 목록의 1순위(유형 필터를 따른다).
  const first = shown.find((r) => r.result?.status === 'ok')?.result ?? null
  return (
    <section className="reveal" style={delay(3)}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="panel-h">출발 관서 목록</h3>
        <select
          className="input ml-auto py-1 text-xs"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as StationType | '')}
          aria-label="유형 필터"
        >
          <option value="">유형 전체</option>
          {STATION_TYPE_KEYS.map((t) => (
            <option key={t} value={t}>
              {STATION_TYPES[t].label}
            </option>
          ))}
        </select>
        <button type="button" className={`chip ${onlyWithin ? 'chip-on' : ''}`} aria-pressed={onlyWithin} onClick={() => setOnlyWithin(!onlyWithin)}>
          {limitMin}분 이내만
        </button>
      </div>
      <div className="mb-2.5 flex items-center gap-2 text-xs">
        <button
          type="button"
          className={`chip flex items-center gap-1.5 ${showAllPaths ? 'chip-on' : ''}`}
          aria-pressed={showAllPaths}
          disabled={withinIds.length === 0}
          onClick={() => set({ showAllPaths: !showAllPaths })}
        >
          <Icon name="routing-2-linear" size={14} />
          가능 관서 경로 모두 보기 · {withinIds.length}건
        </button>
        {Object.keys(paths).length > 0 && (
          <button type="button" className="ml-auto rounded-full px-2 py-1 text-mute hover:bg-hover hover:text-fg" onClick={clearPaths}>
            경로 지우기
          </button>
        )}
      </div>
      {pathError && <p className="mb-2 text-xs text-dest">{pathError}</p>}

      <div className="overflow-x-auto rounded-[1.25rem] bg-elev ring-1 ring-line">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] text-mute">
            <tr>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-2 py-2.5 font-medium">출발관서</th>
              <th className="px-2 py-2.5 text-right font-medium">거리</th>
              <th className="px-2 py-2.5 text-right font-medium">시간</th>
              <th className="px-2 py-2.5 font-medium">판정</th>
              <th className="py-2.5 pr-3 pl-1 font-medium">
                <span className="sr-only">경로</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const ok = r.result?.status === 'ok'
              if (ok) rank += 1
              const showDiff = ok && rank >= 2 && rank <= 10
              const id = r.station.id
              return (
                <tr
                  key={id}
                  className={`cursor-pointer border-t border-line-soft align-top transition-colors duration-300 ease-spring hover:bg-hover ${
                    focusId === id ? 'bg-white/[0.06]' : ''
                  }`}
                  onClick={() => {
                    set({ focusId: id })
                    command('focusStation', [id])
                  }}
                >
                  <td className="w-9 px-3 py-2 whitespace-nowrap tabular-nums text-mute">{ok ? rank : ''}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span dangerouslySetInnerHTML={{ __html: legendShape(r.station.type, undefined, 15) }} />
                      <span className="truncate">{r.station.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right align-top whitespace-nowrap tabular-nums text-dim">
                    {formatDistance(r.result?.distanceM)}
                    {showDiff && r.result?.distanceM != null && first?.distanceM != null && (
                      <span className="block text-[10px] font-medium text-dest">{formatDistanceDiff(r.result.distanceM - first.distanceM)}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right align-top font-medium whitespace-nowrap tabular-nums">
                    {formatDuration(r.result?.durationSec)}
                    {showDiff && r.result?.durationSec != null && first?.durationSec != null && (
                      <span className="block text-[10px] font-medium text-dest">{formatDurationDiff(r.result.durationSec - first.durationSec)}</span>
                    )}
                  </td>
                  <td className="px-2 py-2" title={r.reason}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${VERDICT_STYLE[r.verdict]}`}>
                      {VERDICT_LABEL[r.verdict]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 pl-1">
                    {ok && (
                      <button
                        type="button"
                        title="경로 보기"
                        aria-label={`${r.station.name} 경로 보기`}
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition-[background-color,transform] duration-500 ease-spring hover:scale-110 ${
                          paths[id] ? 'bg-dest/15 text-dest' : 'bg-white/[0.06] text-dim hover:text-fg'
                        }`}
                        disabled={Boolean(pathLoading[id])}
                        onClick={(e) => {
                          e.stopPropagation()
                          set({ focusId: id })
                          loadPath(id)
                        }}
                      >
                        <Icon name={pathLoading[id] ? 'refresh-linear' : 'routing-2-linear'} size={14} className={pathLoading[id] ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-mute">
                  {rows.every((r) => r.verdict === 'pending' || r.verdict === 'skipped')
                    ? '분석 실행을 누르면 결과가 여기에 나옵니다.'
                    : '조건에 맞는 관서가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-mute">
        표 <span className="tabular-nums">{shown.length}</span>행 · 전체 대상 <span className="tabular-nums">{rows.length}</span>곳 · 행을 누르면 지도에서
        위치를 보여 줍니다.
      </p>
    </section>
  )
}

export function Disclaimer() {
  return (
    <aside className="rounded-[1.25rem] bg-white/[0.02] p-4 text-[11px] leading-relaxed text-dim ring-1 ring-line-soft">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-fg">
        <Icon name="info-circle-linear" size={14} />
        예상 도로 이동시간입니다
      </div>
      카카오모빌리티 길찾기가 계산한 차량 이동시간이며, 출동지령·출동준비 시간, 소방차량 주행 특성, 실시간 교통·통제, 기상, 전담의용소방대
      집결시간은 반영하지 않았습니다. 공식 소방력 운영계획이나 대응 가능성 평가에 쓰기 전에 실제 출동 기록으로 검증하세요.
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-3">
        {STATION_TYPE_KEYS.map((t) => (
          <span key={t} className="flex items-center gap-2">
            <span dangerouslySetInnerHTML={{ __html: legendShape(t) }} />
            {STATION_TYPES[t].label}
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span dangerouslySetInnerHTML={{ __html: legendShape('dedicated', SELECTED_COLOR) }} />
          분석 목적지
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-bg px-1.5 text-[10px] font-semibold text-fg ring-1 ring-white/15">14분</span>
          기준 이내 도착
        </span>
        <span className="flex items-center gap-2">
          <span dangerouslySetInnerHTML={{ __html: legendShape('center', '#6b6b73') }} />
          기준 초과
        </span>
        <span className="flex items-center gap-2">
          <span dangerouslySetInnerHTML={{ __html: legendShape('center', '#f4f4f5') }} />
          권역 밖(미계산)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#a8761c] bg-[#fdf3d6] text-[10px] font-bold text-[#6f4c0f]">
            ?
          </span>
          분석 불가
        </span>
      </div>
    </aside>
  )
}
