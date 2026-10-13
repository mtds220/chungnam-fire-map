import { useMemo } from 'react'
import { create } from 'zustand'
import { ApiFailure, fetchConfig, fetchRoutePath, fetchRoutes } from './api/client'
import dataset from './data/stations.json'
import { classify, pendingOriginIds, type Analysis } from './lib/classify'
import type { Destination, PublicConfig, RouteResult, Station, StationDataset, StationType } from './types'
import { STATION_TYPE_KEYS, pointId } from './types'

const data = dataset as StationDataset
const CHUNK = 30
export const PRESET_MINUTES = [10, 20, 30, 40, 60]

type RunStatus = 'idle' | 'running' | 'done' | 'canceled' | 'error'

export interface PlaceInput {
  lat: number
  lng: number
  name?: string
  address?: string
}

interface State {
  stations: Station[]
  dataSource: string
  dataImportedAt: string

  config: PublicConfig | null
  configError: string | null

  /** 지도에 표시할 유형 */
  visibleTypes: Set<StationType>
  /** 분석에 넣을 출발 유형 */
  originTypes: Set<StationType>
  sigungu: string
  department: string
  query: string
  limitMin: number
  hideOver: boolean
  showAllPaths: boolean

  /** 반경 원 — 분석 후 목적지와 출발 1~5순위 둘레에 그린다 */
  radiusOn: boolean
  radiusKm: number
  /** 개별로 끈 원 (목적지 id 또는 관서 id). 목적지가 바뀌면 비운다. */
  radiusHidden: Set<string>

  /** 분석 목적지 — 관서 또는 지도에서 찍은 지점 */
  dest: Destination | null
  /** 정보 창을 띄운 관서 */
  focusId: string | null

  /** 목적지별 결과. 목적지를 바꿨다 돌아와도 다시 호출하지 않는다. */
  results: Record<string, Record<string, RouteResult>>
  /** 분석을 한 번이라도 실행한 목적지 — 조건이 바뀌면 부족한 분만 자동으로 채운다 */
  analyzed: Record<string, true>
  run: { status: RunStatus; done: number; total: number; error: string | null; destId: string | null }
  paths: Record<string, [number, number][]>
  pathLoading: Record<string, boolean>
  pathError: string | null
  /** 지도 이동 요청 (MapView 가 소비) */
  mapCommand: { kind: 'reset' | 'fitAll' | 'focusDest' | 'focusStation' | 'fitStations'; ids?: string[]; seq: number } | null

  loadConfig: () => Promise<void>
  set: (patch: Partial<State>) => void
  toggleType: (key: 'visibleTypes' | 'originTypes', t: StationType) => void
  selectStation: (id: string) => void
  selectPlace: (place: PlaceInput) => void
  setDestAddress: (destId: string, address: string) => void
  clearDest: () => void
  runAnalysis: () => Promise<void>
  cancel: () => void
  retryFailed: () => Promise<void>
  /** 이 목적지의 결과를 비우고 현재 조건(기준시간·유형)으로 처음부터 다시 계산 */
  rerun: () => Promise<void>
  loadPath: (originId: string) => Promise<void>
  clearPaths: () => void
  toggleRadius: (id: string) => void
  command: (kind: NonNullable<State['mapCommand']>['kind'], ids?: string[]) => void
}

let controller: AbortController | null = null
let seq = 0

export const useStore = create<State>()((set, get) => {
  const setDest = (dest: Destination | null) => {
    if (dest?.id === get().dest?.id) {
      if (dest) set({ dest }) // 이름·주소만 바뀐 경우
      return
    }
    get().cancel()
    set({ dest, focusId: null, paths: {}, pathError: null, showAllPaths: false, radiusHidden: new Set() })
    if (dest) get().command('focusDest')
  }

  return {
    stations: data.stations,
    dataSource: data.source,
    dataImportedAt: data.importedAt,

    config: null,
    configError: null,

    visibleTypes: new Set(STATION_TYPE_KEYS),
    originTypes: new Set(STATION_TYPE_KEYS),
    sigungu: '',
    department: '',
    query: '',
    limitMin: 30,
    hideOver: false,
    showAllPaths: false,
    radiusOn: true,
    radiusKm: 5,
    radiusHidden: new Set(),

    dest: null,
    focusId: null,
    results: {},
    analyzed: {},
    run: { status: 'idle', done: 0, total: 0, error: null, destId: null },
    paths: {},
    pathLoading: {},
    pathError: null,
    mapCommand: null,

    loadConfig: async () => {
      try {
        set({ config: await fetchConfig(), configError: null })
      } catch (e) {
        set({ configError: e instanceof Error ? e.message : '설정을 불러오지 못했습니다.' })
      }
    },

    set: (patch) => set(patch),

    toggleType: (key, t) => {
      const next = new Set(get()[key])
      if (next.has(t)) next.delete(t)
      else next.add(t)
      set({ [key]: next } as Pick<State, typeof key>)
    },

    selectStation: (id) => {
      const st = get().stations.find((s) => s.id === id)
      if (!st || st.lat == null || st.lng == null) return
      setDest({ id: st.id, kind: 'station', name: st.name, address: st.address, lat: st.lat, lng: st.lng, stationType: st.type })
    },

    selectPlace: ({ lat, lng, name, address }) => {
      // 좌표를 5자리(약 1m)로 맞춘다. id 와 서버로 보내는 좌표가 같아야 캐시가 맞물린다.
      const la = Number(lat.toFixed(5))
      const lo = Number(lng.toFixed(5))
      setDest({ id: pointId(la, lo), kind: 'point', name: name ?? '선택한 지점', address: address ?? '', lat: la, lng: lo })
    },

    setDestAddress: (destId, address) => {
      const d = get().dest
      if (d?.id === destId) set({ dest: { ...d, address, name: d.name === '선택한 지점' ? address || d.name : d.name } })
    },

    clearDest: () => setDest(null),

    runAnalysis: async () => {
      const s = get()
      const dest = s.dest
      if (!dest || s.run.status === 'running') return
      if (!s.config?.mobilityConfigured) {
        set({ run: { status: 'error', done: 0, total: 0, error: '길찾기 API 연결이 설정되지 않았습니다.', destId: dest.id } })
        return
      }
      const ids = pendingOriginIds(analysisOf(s, dest))
      set({ analyzed: { ...s.analyzed, [dest.id]: true } })
      if (ids.length === 0) {
        set({ run: { status: 'done', done: 0, total: 0, error: null, destId: dest.id } })
        return
      }

      controller?.abort()
      const ctrl = (controller = new AbortController())
      set({ run: { status: 'running', done: 0, total: ids.length, error: null, destId: dest.id } })

      try {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const res = await fetchRoutes(dest, ids.slice(i, i + CHUNK), ctrl.signal)
          const merged = { ...(get().results[dest.id] ?? {}) }
          for (const r of res.results) merged[r.originId] = { ...r, destId: dest.id }
          set({
            results: { ...get().results, [dest.id]: merged },
            run: { ...get().run, done: Math.min(i + CHUNK, ids.length) },
          })
        }
        set({ run: { ...get().run, status: 'done' } })
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          set({ run: { ...get().run, status: 'canceled' } })
          return
        }
        const msg = e instanceof ApiFailure ? e.message : '분석 중 오류가 발생했습니다.'
        const config = get().config
        if (e instanceof ApiFailure && e.code === 'NOT_CONFIGURED' && config)
          set({ config: { ...config, mobilityConfigured: false } })
        set({ run: { ...get().run, status: 'error', error: msg } })
      } finally {
        if (controller === ctrl) controller = null
      }
    },

    cancel: () => {
      controller?.abort()
      controller = null
    },

    retryFailed: async () => {
      const { dest, results } = get()
      if (!dest) return
      const kept = Object.fromEntries(Object.entries(results[dest.id] ?? {}).filter(([, r]) => r.status === 'ok'))
      set({ results: { ...results, [dest.id]: kept }, run: { ...get().run, status: 'idle', error: null } })
      await get().runAnalysis()
    },

    rerun: async () => {
      const { dest, results, run } = get()
      if (!dest || run.status === 'running') return
      // 서버 캐시(CACHE_TTL_HOURS) 안의 경로는 카카오를 다시 부르지 않고 저장값으로 돌아온다
      set({ results: { ...results, [dest.id]: {} }, paths: {}, showAllPaths: false, run: { ...run, status: 'idle', error: null } })
      await get().runAnalysis()
    },

    loadPath: async (originId) => {
      const { dest, paths, pathLoading } = get()
      if (!dest || paths[originId] || pathLoading[originId]) return
      set({ pathLoading: { ...pathLoading, [originId]: true }, pathError: null })
      try {
        const res = await fetchRoutePath(originId, dest)
        if (get().dest?.id !== dest.id) return
        set({ paths: { ...get().paths, [originId]: res.path } })
      } catch (e) {
        set({ pathError: e instanceof Error ? e.message : '경로를 불러오지 못했습니다.' })
      } finally {
        const rest = { ...get().pathLoading }
        delete rest[originId]
        set({ pathLoading: rest })
      }
    },

    clearPaths: () => set({ paths: {}, showAllPaths: false, pathError: null }),

    toggleRadius: (id) => {
      const next = new Set(get().radiusHidden)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // 전체가 꺼져 있을 때 하나를 켜면 전체 스위치도 켠다 — 누른 원이 바로 보이도록
      set(next.has(id) ? { radiusHidden: next } : { radiusHidden: next, radiusOn: true })
    },

    command: (kind, ids) => set({ mapCommand: { kind, ids, seq: ++seq } }),
  }
})

/**
 * 실제로 분석에 넣는 출발 유형 = "출발 관서 유형" ∩ "지도 표시".
 * 지도에서 끈 유형은 화면에 없으니 통계·목록에서도 빠져야 지도와 숫자가 맞는다.
 */
export function effectiveOriginTypes(originTypes: ReadonlySet<StationType>, visibleTypes: ReadonlySet<StationType>) {
  return new Set([...originTypes].filter((t) => visibleTypes.has(t)))
}

function analysisOf(s: State, dest: Destination | null): Analysis {
  return classify({
    stations: s.stations,
    dest,
    results: new Map(Object.entries(dest ? (s.results[dest.id] ?? {}) : {})),
    limitMin: s.limitMin,
    originTypes: effectiveOriginTypes(s.originTypes, s.visibleTypes),
    skipSpeedKmh: s.config?.skipSpeedKmh ?? 150,
  })
}

export interface RadiusTarget {
  id: string
  /** 0 = 목적지, 1~5 = 출발 관서 순위 */
  rank: number
  name: string
  lat: number
  lng: number
  stationType?: StationType
}

/** 반경 원을 그릴 대상: 분석 결과가 있을 때 목적지 + 이동시간 1~5순위 (지도·사이드바가 함께 쓴다) */
export function radiusTargetsOf(analysis: Analysis): RadiusTarget[] {
  const ranked = analysis.rows.filter((r) => r.result?.status === 'ok').slice(0, 5)
  const dest = analysis.dest
  if (!dest || ranked.length === 0) return []
  return [
    { id: dest.id, rank: 0, name: dest.name, lat: dest.lat, lng: dest.lng, stationType: dest.stationType },
    ...ranked.map((r, i) => ({
      id: r.station.id,
      rank: i + 1,
      name: r.station.name,
      lat: r.station.lat!,
      lng: r.station.lng!,
      stationType: r.station.type,
    })),
  ]
}

/** 현재 목적지·조건의 분석 결과. 지도·카드·표가 모두 이것을 읽는다. */
export function useAnalysis(): Analysis {
  const stations = useStore((s) => s.stations)
  const dest = useStore((s) => s.dest)
  const results = useStore((s) => s.results)
  const limitMin = useStore((s) => s.limitMin)
  const originTypes = useStore((s) => s.originTypes)
  const visibleTypes = useStore((s) => s.visibleTypes)
  const skipSpeedKmh = useStore((s) => s.config?.skipSpeedKmh ?? 150)
  return useMemo(
    () =>
      classify({
        stations,
        dest,
        results: new Map(Object.entries(dest ? (results[dest.id] ?? {}) : {})),
        limitMin,
        originTypes: effectiveOriginTypes(originTypes, visibleTypes),
        skipSpeedKmh,
      }),
    [stations, dest, results, limitMin, originTypes, visibleTypes, skipSpeedKmh],
  )
}
