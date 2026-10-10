import { VERDICT_LABEL } from '../lib/classify'
import { formatDistance, formatDuration } from '../lib/format'
import { legendShape } from '../map/markers'
import { useAnalysis, useStore } from '../store'
import type { Station } from '../types'
import { STATION_TYPES } from '../types'
import Icon from './Icon'

/** 관서 마커를 눌렀을 때 뜨는 정보 창 (이중 베젤) */
export default function InfoCard({ station }: { station: Station }) {
  const dest = useStore((s) => s.dest)
  const selectStation = useStore((s) => s.selectStation)
  const loadPath = useStore((s) => s.loadPath)
  const pathLoading = useStore((s) => s.pathLoading[station.id])
  const hasPath = useStore((s) => Boolean(s.paths[station.id]))
  const set = useStore((s) => s.set)
  const row = useAnalysis().rows.find((r) => r.station.id === station.id)
  const meta = STATION_TYPES[station.type]
  const isDest = dest?.id === station.id
  const ok = row?.result?.status === 'ok'

  return (
    <div className="w-72 rounded-[1.25rem] bg-[#34373c]/85 p-1 text-left text-[13px] leading-snug text-fg shadow-[0_24px_48px_-16px_rgba(20,21,24,0.5)] ring-1 ring-white/10 backdrop-blur-xl">
      <div className="rounded-[1rem] bg-panel shadow-[inset_0_1px_1px_rgba(255,255,255,0.07)]">
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
          <span className="mt-0.5" dangerouslySetInnerHTML={{ __html: legendShape(station.type, undefined, 22) }} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{station.name}</div>
            <div className="mt-0.5 text-xs text-mute">
              {meta.label} · {station.department}소방서
            </div>
          </div>
          <button
            type="button"
            className="-mt-1 -mr-1 flex h-7 w-7 items-center justify-center rounded-full text-mute transition-colors duration-300 ease-spring hover:bg-hover hover:text-fg"
            aria-label="닫기"
            onClick={() => set({ focusId: null })}
          >
            <Icon name="close-small-linear" size={18} />
          </button>
        </div>

        <div className="px-3.5 pb-3 text-xs text-dim">
          <div className="flex gap-1.5">
            <Icon name="map-point-linear" size={14} className="mt-px text-mute" />
            {station.address}
          </div>
        </div>

        {row && (ok || row.verdict === 'failed' || row.verdict === 'skipped') && (
          <div className="mx-3.5 mb-3 flex items-center justify-between rounded-xl bg-elev px-3 py-2 ring-1 ring-line">
            {ok ? (
              <>
                <span className="text-sm font-semibold tabular-nums">
                  {formatDuration(row.result!.durationSec)}
                  <span className="ml-1.5 text-xs font-normal text-mute">{formatDistance(row.result!.distanceM)}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.verdict === 'within' ? 'bg-ok/10 text-ok' : 'bg-white/[0.05] text-mute'}`}
                >
                  {VERDICT_LABEL[row.verdict]}
                </span>
              </>
            ) : (
              <span className="text-xs text-warn">
                {VERDICT_LABEL[row.verdict]}
                {row.reason ? ` — ${row.reason}` : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-1.5 border-t border-line-soft p-2">
          {isDest ? (
            <span className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-xs text-dest">
              <Icon name="map-point-wave-bold-duotone" size={15} />
              현재 분석 목적지입니다
            </span>
          ) : (
            <button type="button" className="btn-primary group flex-1 justify-between py-1.5 pl-4" onClick={() => selectStation(station.id)}>
              이 관서를 목적지로
              <span className="btn-nub h-7 w-7" aria-hidden="true">
                <Icon name="arrow-right-linear" size={15} />
              </span>
            </button>
          )}
          {ok && (
            <button
              type="button"
              className="btn-secondary px-3"
              disabled={pathLoading || hasPath}
              onClick={() => loadPath(station.id)}
              title="이 관서에서 목적지까지의 경로"
            >
              <Icon name="routing-2-linear" size={15} />
              {pathLoading ? '조회 중' : hasPath ? '표시됨' : '경로'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
