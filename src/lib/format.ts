export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m === 0) return `${s}초`
  return s === 0 ? `${m}분` : `${m}분 ${s}초`
}

export function formatMinutes(sec: number): string {
  return `${Math.round(sec / 60)}분`
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '—'
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

/** 1순위와의 거리 차이: +0.2km / −350m / ±0m */
export function formatDistanceDiff(m: number): string {
  const sign = m > 0 ? '+' : m < 0 ? '−' : '±'
  const a = Math.abs(m)
  // 100m 이상이면 km 한 자리(예: +0.2km), 그보다 작으면 m — "+0.0km" 가 나오지 않도록
  return `${sign}${a < 100 ? `${Math.round(a)}m` : `${(a / 1000).toFixed(1)}km`}`
}

/** 1순위와의 시간 차이: +1분 10초 / +45초 / ±0초 */
export function formatDurationDiff(sec: number): string {
  const sign = sec > 0 ? '+' : sec < 0 ? '−' : '±'
  return `${sign}${formatDuration(Math.abs(sec))}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? formatDateTime(iso).slice(0, 10) : '—'
}
