import { useEffect, useMemo, useState } from 'react'
import { searchPlaces, type Place } from '../map/geocode'
import { legendShape } from '../map/markers'
import { PRESET_MINUTES, useAnalysis, useStore } from '../store'
import { STATION_TYPES, STATION_TYPE_KEYS } from '../types'
import Icon from './Icon'

export default function Sidebar({ onPicked }: { onPicked?: () => void }) {
  const s = useStore()
  const analysis = useAnalysis()

  return (
    <div className="flex flex-col divide-y divide-line-soft">
      <DestinationSearch onPicked={onPicked} />

      <section className="p-4">
        <SectionTag icon="layers-minimalistic-linear">지도 표시</SectionTag>
        <p className="-mt-1 mb-2 text-[11px] text-mute">끈 유형은 분석 대상에서도 빠집니다.</p>
        <div className="flex flex-col gap-1">
          {STATION_TYPE_KEYS.map((t) => {
            const on = s.visibleTypes.has(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => s.toggleType('visibleTypes', t)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-[background-color,opacity] duration-500 ease-spring hover:bg-hover ${
                  on ? '' : 'opacity-40'
                }`}
              >
                <span dangerouslySetInnerHTML={{ __html: legendShape(t, undefined, 18) }} />
                <span className="flex-1">{STATION_TYPES[t].label}</span>
                <span className="tabular-nums text-xs text-mute">{s.stations.filter((x) => x.type === t).length}</span>
                <span
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-500 ease-spring ${on ? 'bg-fg' : 'bg-white/10'}`}
                  aria-hidden="true"
                >
                  <span className={`h-3 w-3 rounded-full transition-transform duration-500 ease-spring ${on ? 'translate-x-3 bg-bg' : 'bg-mute'}`} />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="p-4">
        <SectionTag icon="stopwatch-linear">분석 조건</SectionTag>
        <div className="mb-2 text-xs text-mute">이동시간 기준</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip tabular-nums ${s.limitMin === m ? 'chip-on' : ''}`}
              aria-pressed={s.limitMin === m}
              onClick={() => s.set({ limitMin: m })}
            >
              {m}분
            </button>
          ))}
          <CustomMinutes />
        </div>

        <div className="mt-4 mb-2 text-xs text-mute">출발 관서 유형</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`chip ${s.originTypes.size === STATION_TYPE_KEYS.length ? 'chip-on' : ''}`}
            onClick={() => s.set({ originTypes: new Set(STATION_TYPE_KEYS) })}
          >
            전체
          </button>
          {STATION_TYPE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${s.originTypes.has(t) && s.originTypes.size < STATION_TYPE_KEYS.length ? 'chip-on' : ''} ${
                s.visibleTypes.has(t) ? '' : 'line-through opacity-40'
              }`}
              title={s.visibleTypes.has(t) ? undefined : '지도 표시에서 꺼져 있어 분석에서 빠집니다'}
              aria-pressed={s.originTypes.has(t)}
              onClick={() => {
                // 전체 상태에서 누르면 그 유형만, 아니면 복수 선택 토글
                if (s.originTypes.size === STATION_TYPE_KEYS.length) s.set({ originTypes: new Set([t]) })
                else if (s.originTypes.has(t) && s.originTypes.size === 1) s.set({ originTypes: new Set(STATION_TYPE_KEYS) })
                else s.toggleType('originTypes', t)
              }}
            >
              {STATION_TYPES[t].short}
            </button>
          ))}
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-dim">
          <input type="checkbox" checked={s.hideOver} onChange={(e) => s.set({ hideOver: e.target.checked })} />
          기준 초과·권역 밖 관서 숨기기
        </label>
      </section>

      <RunBox pending={analysis.stats.pending} targets={analysis.stats.targets} />
    </div>
  )
}

function SectionTag({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-3">
      <span className="eyebrow">
        <Icon name={icon} size={13} />
        {children}
      </span>
    </h2>
  )
}

function CustomMinutes() {
  const limitMin = useStore((s) => s.limitMin)
  const set = useStore((s) => s.set)
  const isCustom = !PRESET_MINUTES.includes(limitMin)
  const [text, setText] = useState(isCustom ? String(limitMin) : '')
  const apply = () => {
    const n = Math.round(Number(text))
    if (Number.isFinite(n) && n >= 1 && n <= 180) set({ limitMin: n })
  }
  return (
    <span className={`chip flex items-center gap-1 pr-2.5 ${isCustom ? 'chip-on' : ''}`}>
      <input
        type="number"
        min={1}
        max={180}
        inputMode="numeric"
        placeholder="직접"
        aria-label="이동시간 기준 직접 입력(분)"
        className="w-10 bg-transparent text-center tabular-nums outline-none placeholder:text-current placeholder:opacity-60"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && apply()}
      />
      분
    </span>
  )
}

function RunBox({ pending, targets }: { pending: number; targets: number }) {
  const dest = useStore((s) => s.dest)
  const run = useStore((s) => s.run)
  const config = useStore((s) => s.config)
  const analyzed = useStore((s) => (s.dest ? Boolean(s.analyzed[s.dest.id]) : false))
  const runAnalysis = useStore((s) => s.runAnalysis)
  const rerun = useStore((s) => s.rerun)
  const cancel = useStore((s) => s.cancel)
  const retryFailed = useStore((s) => s.retryFailed)
  const failed = useAnalysis().stats.failed
  const running = run.status === 'running' && run.destId === dest?.id
  const thisRun = run.destId === dest?.id ? run : null
  // 이미 분석한 목적지에서 계산할 것이 남아 있지 않으면 "다시 분석" — 현재 조건으로 처음부터 다시 계산한다
  const again = Boolean(dest) && analyzed && pending === 0
  const label = !dest
    ? '목적지를 먼저 고르세요'
    : running
      ? '분석 중…'
      : again
        ? `다시 분석 · ${targets}곳`
        : targets === 0
          ? '분석할 관서 유형이 없습니다'
          : `분석 실행 · ${pending}곳`

  return (
    <section className="p-4">
      {!config?.mobilityConfigured && config && (
        <p className="mb-3 flex gap-2 rounded-2xl bg-warn/10 px-3 py-2.5 text-xs text-warn ring-1 ring-warn/25">
          <Icon name="danger-triangle-linear" size={15} className="mt-px" />
          길찾기 API 연결 미설정 — 지도와 관서 조회만 사용할 수 있습니다.
        </p>
      )}
      <button
        type="button"
        className="btn-primary group w-full justify-between py-2.5 pl-5 text-[15px]"
        disabled={!dest || running || !config?.mobilityConfigured || targets === 0}
        onClick={again ? rerun : runAnalysis}
      >
        <span className="tabular-nums">{label}</span>
        <span className="btn-nub" aria-hidden="true">
          <Icon name={again ? 'restart-linear' : 'arrow-right-linear'} size={17} />
        </span>
      </button>
      {again && !running && (
        <p className="mt-2 text-center text-[11px] leading-relaxed text-mute">
          유형·기준시간을 바꾸면 결과에 바로 반영됩니다.
          <br />
          다시 분석은 지금 조건으로 처음부터 계산합니다.
        </p>
      )}

      {running && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full origin-left rounded-full bg-fg transition-transform duration-700 ease-spring"
              style={{ transform: `scaleX(${run.done / Math.max(1, run.total)})` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-dim">
            <span className="tabular-nums">
              {run.done} / {run.total}곳 계산
            </span>
            <button type="button" className="rounded-full px-2 py-0.5 text-dest hover:bg-dest/10" onClick={cancel}>
              취소
            </button>
          </div>
        </div>
      )}
      {thisRun?.status === 'canceled' && <p className="mt-2 text-xs text-dim">취소했습니다. 다시 실행하면 남은 관서만 계산합니다.</p>}
      {thisRun?.status === 'error' && <p className="mt-2 text-xs text-dest">{thisRun.error}</p>}
      {!running && failed > 0 && (
        <button type="button" className="btn-secondary mt-2 w-full" onClick={retryFailed}>
          <Icon name="restart-linear" size={15} />
          분석 불가 {failed}곳 다시 시도
        </button>
      )}
    </section>
  )
}

/** 목적지 검색 — 소방관서 이름과 주소·장소를 함께 찾는다 */
function DestinationSearch({ onPicked }: { onPicked?: () => void }) {
  const stations = useStore((s) => s.stations)
  const query = useStore((s) => s.query)
  const sigungu = useStore((s) => s.sigungu)
  const department = useStore((s) => s.department)
  const dest = useStore((s) => s.dest)
  const set = useStore((s) => s.set)
  const selectStation = useStore((s) => s.selectStation)
  const selectPlace = useStore((s) => s.selectPlace)
  const command = useStore((s) => s.command)
  const [places, setPlaces] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)

  const sigungus = useMemo(() => [...new Set(stations.map((s) => s.sigungu))], [stations])
  const departments = useMemo(
    () => [...new Set(stations.filter((s) => !sigungu || s.sigungu === sigungu).map((s) => s.department))],
    [stations, sigungu],
  )
  const q = query.trim()
  const list = useMemo(
    () =>
      stations.filter(
        (s) =>
          (!sigungu || s.sigungu === sigungu) &&
          (!department || s.department === department) &&
          (!q || s.name.includes(q) || s.address.includes(q)),
      ),
    [stations, sigungu, department, q],
  )

  // 주소·장소 검색은 입력이 멈춘 뒤 한 번만
  useEffect(() => {
    if (q.length < 2) return setPlaces([])
    setSearching(true)
    const t = setTimeout(() => {
      searchPlaces(q)
        .then(setPlaces)
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const pickPlace = (p: Place) => {
    selectPlace({ lat: p.lat, lng: p.lng, name: p.kind === 'place' ? p.name : p.address, address: p.address })
    onPicked?.()
  }

  return (
    <section className="p-4">
      <SectionTag icon="map-point-search-linear">목적지 선택</SectionTag>
      <div className="relative">
        <Icon name="magnifer-linear" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" />
        <input
          type="search"
          className="input w-full pl-9"
          placeholder="관서명, 주소 또는 장소 검색"
          value={query}
          onChange={(e) => set({ query: e.target.value })}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          className="input"
          aria-label="시·군"
          value={sigungu}
          onChange={(e) => {
            set({ sigungu: e.target.value, department: '' })
            const ids = stations.filter((s) => !e.target.value || s.sigungu === e.target.value).map((s) => s.id)
            command(e.target.value ? 'fitStations' : 'reset', ids)
          }}
        >
          <option value="">시·군 전체</option>
          {sigungus.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="관할 소방서"
          value={department}
          onChange={(e) => {
            set({ department: e.target.value })
            const ids = stations.filter((s) => s.department === e.target.value).map((s) => s.id)
            if (e.target.value) command('fitStations', ids)
          }}
        >
          <option value="">소방서 전체</option>
          {departments.map((v) => (
            <option key={v} value={v}>
              {v}소방서
            </option>
          ))}
        </select>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-mute">
        <Icon name="cursor-linear" size={14} />
        지도의 아무 지점을 클릭해도 목적지가 됩니다.
      </p>

      {(q || sigungu || department) && (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl bg-elev ring-1 ring-line">
          <div className="sticky top-0 z-10 bg-elev/95 px-3 py-1.5 text-[11px] font-medium text-mute backdrop-blur">
            소방관서 <span className="tabular-nums">{list.length}</span>
          </div>
          {list.slice(0, 80).map((st) => (
            <button
              key={st.id}
              type="button"
              className={`list-row ${dest?.id === st.id ? 'bg-dest/10' : ''}`}
              onClick={() => {
                selectStation(st.id)
                onPicked?.()
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: legendShape(st.type) }} />
              <span className="truncate">{st.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-mute">{st.department}</span>
            </button>
          ))}
          {list.length === 0 && <div className="px-3 py-2 text-xs text-mute">일치하는 관서가 없습니다.</div>}

          {q.length >= 2 && (
            <>
              <div className="sticky top-0 z-10 bg-elev/95 px-3 py-1.5 text-[11px] font-medium text-mute backdrop-blur">
                주소·장소 {searching ? '검색 중…' : <span className="tabular-nums">{places.length}</span>}
              </div>
              {places.map((p, i) => (
                <button key={`${p.kind}-${i}`} type="button" className="list-row" onClick={() => pickPlace(p)}>
                  <Icon name={p.kind === 'place' ? 'map-point-linear' : 'home-2-linear'} size={16} className="text-dest" />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    {p.kind === 'place' && <span className="block truncate text-[11px] text-mute">{p.address}</span>}
                  </span>
                </button>
              ))}
              {!searching && places.length === 0 && <div className="px-3 py-2 text-xs text-mute">검색 결과가 없습니다.</div>}
            </>
          )}
        </div>
      )}
    </section>
  )
}
