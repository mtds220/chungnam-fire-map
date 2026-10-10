import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadKakaoMaps, type Kakao } from '../map/loadKakao'
import { reverseGeocode } from '../map/geocode'
import { markerHtml, pointPinHtml, SELECTED_COLOR, zIndexOf, type MarkerRole } from '../map/markers'
import { useAnalysis, useStore } from '../store'
import type { Station } from '../types'
import Icon from './Icon'
import InfoCard from './InfoCard'
import MapControls from './MapControls'

interface Entry {
  station: Station
  el: HTMLDivElement
  overlay: Kakao
  html: string
}

export default function MapView() {
  const config = useStore((s) => s.config)
  const configError = useStore((s) => s.configError)
  const stations = useStore((s) => s.stations)
  const visibleTypes = useStore((s) => s.visibleTypes)
  const hideOver = useStore((s) => s.hideOver)
  const dest = useStore((s) => s.dest)
  const focusId = useStore((s) => s.focusId)
  const paths = useStore((s) => s.paths)
  const showAllPaths = useStore((s) => s.showAllPaths)
  const mapCommand = useStore((s) => s.mapCommand)
  const analysis = useAnalysis()

  const boxRef = useRef<HTMLDivElement>(null)
  const kakaoRef = useRef<Kakao>(null)
  const mapRef = useRef<Kakao>(null)
  const clustererRef = useRef<Kakao>(null)
  const entriesRef = useRef(new Map<string, Entry>())
  const destOverlayRef = useRef<Kakao>(null)
  const infoOverlayRef = useRef<Kakao>(null)
  const linesRef = useRef<Kakao[]>([])
  const infoEl = useMemo(() => document.createElement('div'), [])

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [clusterOn, setClusterOn] = useState(true)

  const bounds = useMemo(() => {
    const pts = stations.filter((s) => s.lat != null && s.lng != null)
    return {
      minLat: Math.min(...pts.map((s) => s.lat!)),
      maxLat: Math.max(...pts.map((s) => s.lat!)),
      minLng: Math.min(...pts.map((s) => s.lng!)),
      maxLng: Math.max(...pts.map((s) => s.lng!)),
    }
  }, [stations])

  // ── 1. SDK 로드 + 지도·클러스터러·관서 오버레이 생성 ─────────────────────
  useEffect(() => {
    const key = config?.kakaoJsKey
    if (!key || mapRef.current) return
    let cancelled = false
    loadKakaoMaps(key)
      .then((kakao) => {
        if (cancelled || !boxRef.current) return
        const { maps } = kakao
        kakaoRef.current = kakao
        const map = new maps.Map(boxRef.current, { center: new maps.LatLng(36.55, 126.85), level: 11 })
        mapRef.current = map
        fitBounds(kakao, map, bounds)

        clustererRef.current = new maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 9,
          disableClickZoom: false,
          calculator: [10, 30],
          styles: [0, 1, 2].map((i) => ({
            width: `${34 + i * 8}px`,
            height: `${34 + i * 8}px`,
            lineHeight: `${34 + i * 8}px`,
            background: 'rgba(43, 45, 49, 0.9)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 0 0 5px rgba(43,45,49,0.15), 0 8px 20px -8px rgba(20,21,24,0.45)',
            borderRadius: '50%',
            color: '#fff',
            textAlign: 'center',
            fontWeight: '600',
            fontSize: '13px',
            fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif",
            fontVariantNumeric: 'tabular-nums',
          })),
        })

        for (const st of stations) {
          if (st.lat == null || st.lng == null) continue
          const el = document.createElement('div')
          el.className = 'mk-host'
          el.addEventListener('click', () => {
            const s = useStore.getState()
            s.set({ focusId: s.focusId === st.id ? null : st.id })
          })
          const overlay = new maps.CustomOverlay({
            position: new maps.LatLng(st.lat, st.lng),
            content: el,
            yAnchor: 0.5,
            xAnchor: 0.5,
            clickable: true, // 마커를 누르면 지도 클릭(지점 선택)으로 번지지 않는다
          })
          entriesRef.current.set(st.id, { station: st, el, overlay, html: '' })
        }

        infoOverlayRef.current = new maps.CustomOverlay({ content: infoEl, yAnchor: 1.15, zIndex: 30, clickable: true })

        // 지도의 아무 지점이나 누르면 그 지점이 분석 목적지가 된다
        maps.event.addListener(map, 'click', (e: Kakao) => {
          const lat = e.latLng.getLat()
          const lng = e.latLng.getLng()
          const store = useStore.getState()
          store.set({ focusId: null })
          store.selectPlace({ lat, lng })
          const id = useStore.getState().dest?.id
          reverseGeocode(lat, lng).then((address) => id && useStore.getState().setDestAddress(id, address))
        })

        const ro = new ResizeObserver(() => map.relayout())
        ro.observe(boxRef.current)
        setReady(true)
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message))
    return () => {
      cancelled = true
    }
  }, [config?.kakaoJsKey, stations, bounds, infoEl])

  // ── 2. 마커 모양·표시 여부 갱신 ─────────────────────────────────────────
  const roleOf = useMemo(() => {
    const m = new Map<string, { role: MarkerRole; durationSec: number | null }>()
    for (const r of analysis.rows) m.set(r.station.id, { role: r.verdict, durationSec: r.result?.durationSec ?? null })
    return m
  }, [analysis])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    const clusterer = clustererRef.current
    const visible: Kakao[] = []
    for (const [id, e] of entriesRef.current) {
      const isDest = dest?.kind === 'station' && dest.id === id
      const info = roleOf.get(id)
      const role: MarkerRole = isDest ? 'dest' : (info?.role ?? 'normal')
      const show =
        !isDest && // 목적지 관서는 따로 그린다(클러스터에 묻히지 않게)
        visibleTypes.has(e.station.type) &&
        !(hideOver && (role === 'over' || role === 'skipped'))
      const html = markerHtml(e.station, { role, focused: focusId === id, durationSec: info?.durationSec ?? null })
      if (html !== e.html) {
        e.el.innerHTML = html
        e.html = html
      }
      e.overlay.setZIndex(zIndexOf(role))
      if (show) visible.push(e.overlay)
    }
    clusterer.clear()
    for (const e of entriesRef.current.values()) e.overlay.setMap(null)
    if (clusterOn) clusterer.addMarkers(visible)
    else visible.forEach((o) => o.setMap(map))
  }, [ready, roleOf, visibleTypes, hideOver, dest, focusId, clusterOn])

  // 분석 결과가 처음 들어오면 클러스터를 풀어 판정이 한눈에 보이게 한다
  const hasResults = analysis.stats.within + analysis.stats.over + analysis.stats.failed > 0
  useEffect(() => {
    if (hasResults) setClusterOn(false)
  }, [hasResults])

  // ── 3. 목적지 마커 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    const { maps } = kakaoRef.current
    destOverlayRef.current?.setMap(null)
    destOverlayRef.current = null
    if (!dest) return
    const st = dest.kind === 'station' ? stations.find((s) => s.id === dest.id) : undefined
    // 관서는 도형 중심이, 지점은 핀 끝이 좌표에 오도록 놓는다. CustomOverlay 는 yAnchor 를 바꿀 수 없어 매번 새로 만든다.
    const ov = new maps.CustomOverlay({
      position: new maps.LatLng(dest.lat, dest.lng),
      content: st ? markerHtml(st, { role: 'dest', focused: false, durationSec: null }) : pointPinHtml(dest.address || dest.name),
      yAnchor: st ? 0.5 : 1,
      zIndex: 20,
      clickable: true,
    })
    ov.setMap(mapRef.current)
    destOverlayRef.current = ov
  }, [ready, dest, stations])

  // ── 4. 정보 창 ─────────────────────────────────────────────────────────
  const focusStation = focusId ? stations.find((s) => s.id === focusId) : undefined
  useEffect(() => {
    if (!ready) return
    const ov = infoOverlayRef.current
    if (!focusStation || focusStation.lat == null || focusStation.lng == null) return ov.setMap(null)
    ov.setPosition(new kakaoRef.current.maps.LatLng(focusStation.lat, focusStation.lng))
    ov.setMap(mapRef.current)
  }, [ready, focusStation])

  // ── 5. 경로선 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    const { maps } = kakaoRef.current
    linesRef.current.forEach((l) => l.setMap(null))
    linesRef.current = []
    const draw = (pts: [number, number][], color: string, weight: number, opacity: number, z: number) => {
      const line = new maps.Polyline({
        path: pts.map(([x, y]) => new maps.LatLng(y, x)),
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        zIndex: z,
      })
      line.setMap(mapRef.current)
      linesRef.current.push(line)
    }
    if (showAllPaths) {
      for (const r of analysis.rows)
        if (r.verdict === 'within' && paths[r.station.id] && r.station.id !== focusId)
          draw(paths[r.station.id], '#2b2d31', 3, 0.5, 1)
    }
    if (focusId && paths[focusId]) draw(paths[focusId], SELECTED_COLOR, 5, 0.9, 2)
  }, [ready, paths, showAllPaths, focusId, analysis])

  // ── 6. 지도 이동 명령 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapCommand) return
    const kakao = kakaoRef.current
    const map = mapRef.current
    const { dest: d, stations: all } = useStore.getState()
    switch (mapCommand.kind) {
      case 'reset':
        fitBounds(kakao, map, bounds)
        break
      case 'fitAll': {
        const vis = all.filter((s) => useStore.getState().visibleTypes.has(s.type))
        fitStations(kakao, map, vis)
        break
      }
      case 'fitStations':
        fitStations(kakao, map, all.filter((s) => mapCommand.ids?.includes(s.id)))
        break
      case 'focusStation': {
        const st = all.find((s) => s.id === mapCommand.ids?.[0])
        if (st?.lat != null && st.lng != null) panTo(kakao, map, st.lat, st.lng)
        break
      }
      case 'focusDest':
        if (d) panTo(kakao, map, d.lat, d.lng)
        break
    }
  }, [ready, mapCommand, bounds])

  const zoom = (delta: number) => mapRef.current?.setLevel(mapRef.current.getLevel() + delta, { animate: true })

  const message = configError
    ? `서버에 연결할 수 없습니다: ${configError}`
    : config && !config.kakaoJsKey
      ? '카카오맵 JavaScript 키(KAKAO_JS_KEY)가 설정되지 않았습니다. README 의 "API 키 설정"을 참고하세요.'
      : loadError

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="h-full w-full bg-panel" />
      {message && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel p-6">
          <p className="flex max-w-md gap-2.5 rounded-2xl bg-warn/10 px-4 py-3 text-sm leading-relaxed text-warn ring-1 ring-warn/25">
            <Icon name="danger-triangle-linear" size={18} className="mt-0.5" />
            {message}
          </p>
        </div>
      )}
      {!message && !ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-mute">
          <Icon name="refresh-linear" size={16} className="animate-spin" />
          지도를 불러오는 중…
        </div>
      )}
      {ready && (
        <MapControls
          onZoomIn={() => zoom(-1)}
          onZoomOut={() => zoom(1)}
          clusterOn={clusterOn}
          onToggleCluster={() => setClusterOn((v) => !v)}
        />
      )}
      {ready && !dest && (
        <div className="glass pointer-events-none absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-xs text-fg sm:whitespace-nowrap">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dest/20 text-dest">
            <Icon name="cursor-linear" size={14} />
          </span>
          관서 마커나 지도의 아무 지점을 누르면 분석 목적지가 됩니다
        </div>
      )}
      {focusStation && createPortal(<InfoCard station={focusStation} />, infoEl)}
    </div>
  )
}

function fitBounds(kakao: Kakao, map: Kakao, b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  const { maps } = kakao
  const lb = new maps.LatLngBounds(new maps.LatLng(b.minLat, b.minLng), new maps.LatLng(b.maxLat, b.maxLng))
  map.setBounds(lb, 24, 24, 24, 24)
}

function fitStations(kakao: Kakao, map: Kakao, list: Station[]) {
  const pts = list.filter((s) => s.lat != null && s.lng != null)
  if (pts.length === 0) return
  if (pts.length === 1) return panTo(kakao, map, pts[0].lat!, pts[0].lng!)
  const lb = new kakao.maps.LatLngBounds()
  pts.forEach((s) => lb.extend(new kakao.maps.LatLng(s.lat, s.lng)))
  map.setBounds(lb, 40, 40, 40, 40)
}

function panTo(kakao: Kakao, map: Kakao, lat: number, lng: number) {
  if (map.getLevel() > 9) map.setLevel(9)
  map.panTo(new kakao.maps.LatLng(lat, lng))
}
