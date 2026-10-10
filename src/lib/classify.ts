// 경로 결과 + 분석 조건 → 관서별 판정과 집계.
// 지도·통계 카드·결과표가 모두 이 함수의 출력만 읽는다. 그래야 세 곳의 숫자가 어긋나지 않는다.
import type { Destination, RouteResult, Station, StationType } from '../types'
import { STATION_TYPE_KEYS } from '../types'
import { haversineM, unreachableBeyondM } from './geo'

/**
 * - within  : 실제 도로 이동시간 ≤ 기준시간 (경계값 포함)
 * - over    : 실제 도로 이동시간 > 기준시간
 * - failed  : 경로 계산 실패 또는 좌표 없음
 * - skipped : 직선거리만으로도 기준시간 안에 닿을 수 없어 호출하지 않음 (권역 밖, 미계산)
 * - pending : 아직 계산하지 않음
 */
export type Verdict = 'within' | 'over' | 'failed' | 'skipped' | 'pending'

export const VERDICT_LABEL: Record<Verdict, string> = {
  within: '가능',
  over: '초과',
  failed: '분석 불가',
  skipped: '권역 밖(미계산)',
  pending: '미계산',
}

export interface AnalysisRow {
  station: Station
  verdict: Verdict
  result: RouteResult | null
  straightM: number | null
  reason?: string
}

export interface AnalysisInput {
  stations: Station[]
  /** 관서 또는 지도에서 찍은 지점 */
  dest: Destination | null
  results: ReadonlyMap<string, RouteResult>
  limitMin: number
  originTypes: ReadonlySet<StationType>
  skipSpeedKmh: number
  /** 재배치 검토용 가상 제외 (§11 ④). 아직 UI 는 없다. */
  excludeIds?: ReadonlySet<string>
}

export interface AnalysisStats {
  targets: number
  within: number
  withinByType: Record<StationType, number>
  over: number
  failed: number
  skipped: number
  pending: number
  nearest: AnalysisRow | null
  histogram: { label: string; from: number; to: number | null; count: number }[]
}

export interface Analysis {
  dest: Destination | null
  rows: AnalysisRow[]
  stats: AnalysisStats
}

const ORDER: Record<Verdict, number> = { within: 0, over: 1, failed: 2, pending: 3, skipped: 4 }

export function classify(input: AnalysisInput): Analysis {
  const { stations, dest, results, limitMin, originTypes, skipSpeedKmh, excludeIds } = input
  const limitSec = limitMin * 60
  const skipBeyond = unreachableBeyondM(limitMin, skipSpeedKmh)

  const rows: AnalysisRow[] = []
  if (dest) {
    for (const s of stations) {
      if (s.id === dest.id || !originTypes.has(s.type) || excludeIds?.has(s.id)) continue
      const straightM =
        s.lat != null && s.lng != null
          ? haversineM(s.lat, s.lng, dest.lat, dest.lng)
          : null
      const result = results.get(s.id) ?? null
      rows.push({ station: s, result, straightM, ...judge(result, straightM, limitSec, skipBeyond) })
    }
  }

  rows.sort(
    (a, b) =>
      ORDER[a.verdict] - ORDER[b.verdict] ||
      (a.result?.durationSec ?? Infinity) - (b.result?.durationSec ?? Infinity) ||
      (a.straightM ?? Infinity) - (b.straightM ?? Infinity),
  )

  return { dest, rows, stats: summarize(rows, limitMin) }
}

function judge(
  result: RouteResult | null,
  straightM: number | null,
  limitSec: number,
  skipBeyond: number,
): { verdict: Verdict; reason?: string } {
  if (straightM == null) return { verdict: 'failed', reason: '좌표 없음' }
  if (result) {
    if (result.status !== 'ok' || result.durationSec == null)
      return { verdict: 'failed', reason: result.errorMessage ?? '경로 없음' }
    return { verdict: result.durationSec <= limitSec ? 'within' : 'over' }
  }
  if (straightM > skipBeyond) return { verdict: 'skipped' }
  return { verdict: 'pending' }
}

function summarize(rows: AnalysisRow[], limitMin: number): AnalysisStats {
  const withinByType = Object.fromEntries(STATION_TYPE_KEYS.map((k) => [k, 0])) as Record<StationType, number>
  const count: Record<Verdict, number> = { within: 0, over: 0, failed: 0, skipped: 0, pending: 0 }
  for (const r of rows) {
    count[r.verdict] += 1
    if (r.verdict === 'within') withinByType[r.station.type] += 1
  }

  // 5분 단위, 기준시간(최소 30분)까지 칸을 나누고 그 위는 한 칸으로 묶는다.
  const top = Math.max(30, Math.ceil(limitMin / 5) * 5)
  const histogram: AnalysisStats['histogram'] = []
  for (let m = 0; m < top; m += 5) histogram.push({ label: `${m}~${m + 5}`, from: m, to: m + 5, count: 0 })
  histogram.push({ label: `${top}+`, from: top, to: null, count: 0 })
  for (const r of rows) {
    const sec = r.result?.status === 'ok' ? r.result.durationSec : null
    if (sec == null) continue
    const min = sec / 60
    // 칸의 위 경계를 포함한다 — 정확히 30분은 25~30 칸에 들어가 "가능" 과 일치한다.
    const bin = histogram.find((h) => h.to == null || min <= h.to)!
    bin.count += 1
  }

  return {
    targets: rows.length,
    within: count.within,
    withinByType,
    over: count.over,
    failed: count.failed,
    skipped: count.skipped,
    pending: count.pending,
    nearest: rows.find((r) => r.verdict === 'within' || r.verdict === 'over') ?? null,
    histogram,
  }
}

/** 지금 조건에서 아직 계산하지 않은 출발 관서. 기준을 올리면 생략 범위를 벗어난 관서가 여기 새로 나타난다. */
export function pendingOriginIds(analysis: Analysis): string[] {
  return analysis.rows.filter((r) => r.verdict === 'pending').map((r) => r.station.id)
}
