import { formatDate } from '../lib/format'
import { legendShape } from '../map/markers'
import { useStore } from '../store'
import { STATION_TYPES, STATION_TYPE_KEYS } from '../types'
import Icon from './Icon'

/** 떠 있는 유리 알약 내비. 화면 가장자리에 붙이지 않는다. */
export default function Header() {
  const stations = useStore((s) => s.stations)
  const importedAt = useStore((s) => s.dataImportedAt)
  const source = useStore((s) => s.dataSource)
  const config = useStore((s) => s.config)
  const configError = useStore((s) => s.configError)

  const connected = config?.mobilityConfigured
  const status = configError ? '서버 연결 실패' : config == null ? '확인 중' : connected ? '길찾기 연결됨' : '길찾기 미설정'

  return (
    <header className="glass reveal mx-auto flex w-full max-w-max flex-wrap items-center gap-x-4 gap-y-2 rounded-[1.75rem] py-2 pr-2 pl-2 lg:rounded-full">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dest/15 text-dest ring-1 ring-dest/30">
          <Icon name="fire-bold-duotone" size={19} />
        </span>
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold tracking-tight">충청남도 소방력 통합지도</h1>
          <p className="text-[11px] text-mute">30분 도착권역 분석</p>
        </div>
      </div>

      <span className="hidden h-6 w-px bg-white/10 md:block" aria-hidden="true" />

      <dl className="flex items-center gap-3 text-xs text-dim">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">전체 관서</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-fg">{stations.length}</dd>
          <span>곳</span>
        </div>
        {STATION_TYPE_KEYS.map((t) => (
          <div key={t} className="flex items-center gap-1" title={STATION_TYPES[t].label}>
            <span dangerouslySetInnerHTML={{ __html: legendShape(t, undefined, 14) }} />
            <dt className="sr-only">{STATION_TYPES[t].label}</dt>
            <dd className="tabular-nums">{stations.filter((s) => s.type === t).length}</dd>
          </div>
        ))}
      </dl>

      <span className="hidden h-6 w-px bg-white/10 md:block" aria-hidden="true" />

      <div className="flex items-center gap-1.5 text-xs text-dim">
        <span className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5" title={`원본: ${source}`}>
          <Icon name="calendar-minimalistic-linear" size={14} className="text-mute" />
          {formatDate(importedAt)}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-ok shadow-[0_0_8px_rgba(95,211,154,0.6)]' : 'bg-warn'}`}
            aria-hidden="true"
          />
          {status}
        </span>
        <button
          type="button"
          disabled
          title="다음 단계(7단계)에서 제공 예정"
          className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-3 py-1.5 text-mute"
        >
          <Icon name="database-linear" size={14} />
          데이터 관리
        </button>
      </div>
    </header>
  )
}
