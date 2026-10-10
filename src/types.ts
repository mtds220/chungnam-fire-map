// 서버와 클라이언트가 함께 쓰는 도메인 타입. 런타임 의존성을 두지 않는다.

/** 관서 유형. 소방서·구조대 등을 늘릴 때는 여기와 STATION_TYPES 에 항목만 더한다. */
export type StationType = 'center' | 'local' | 'dedicated'

export interface StationTypeMeta {
  label: string
  short: string
  color: string
}

export const STATION_TYPES: Record<StationType, StationTypeMeta> = {
  center: { label: '119안전센터', short: '안전센터', color: '#3b7bf6' },
  local: { label: '119지역대', short: '지역대', color: '#f59a0b' },
  dedicated: { label: '전담의용소방대', short: '전담대', color: '#1fae5b' },
}

export const STATION_TYPE_KEYS = Object.keys(STATION_TYPES) as StationType[]

export interface Station {
  id: string
  name: string
  type: StationType
  /** 관할 소방서 */
  department: string
  sigungu: string
  address: string
  lat: number | null
  lng: number | null
  status: string
  note: string
  sourceRow?: number
}

export interface StationDataset {
  source: string
  importedAt: string
  count: number
  stations: Station[]
}

export type RouteMethod = 'multi' | 'single'

/** 출발 관서 하나 → 목적지의 경로 계산 결과. 실패하면 시간·거리를 비워 둔다(임의 값 금지). */
export interface RouteResult {
  originId: string
  destId: string
  status: 'ok' | 'failed'
  durationSec: number | null
  distanceM: number | null
  method: RouteMethod
  /** 이 값을 카카오 API 로부터 받은 시각 (ISO) */
  computedAt: string
  errorCode?: string
  errorMessage?: string
}

/**
 * 분석 목적지. 관서를 고르거나 지도의 아무 지점(주소)을 클릭해 정한다.
 * 지점의 id 는 좌표로 만든다(`pt:36.12345,127.12345`) — 같은 지점을 다시 찍으면 캐시된 결과를 다시 쓴다.
 */
export interface Destination {
  id: string
  kind: 'station' | 'point'
  name: string
  address: string
  lat: number
  lng: number
  stationType?: StationType
}

export function pointId(lat: number, lng: number) {
  return `pt:${lat.toFixed(5)},${lng.toFixed(5)}`
}

/** 목적지는 관서 id 또는 지점 좌표 둘 중 하나로 보낸다. */
export interface RoutesRequest {
  destId?: string
  destPoint?: { lat: number; lng: number }
  originIds: string[]
}

export interface RoutesResponse {
  results: RouteResult[]
  calls: { multi: number; single: number; cached: number }
}

export interface PublicConfig {
  kakaoJsKey: string | null
  mobilityConfigured: boolean
  multiOriginRadiusM: number
  /** 직선거리로 호출을 생략하는 상한 속도 (km/h) */
  skipSpeedKmh: number
  priority: string
}

export interface RoutePathResponse {
  originId: string
  destId: string
  durationSec: number
  distanceM: number
  /** [lng, lat] 순서 */
  path: [number, number][]
}

export interface ApiError {
  code: 'NOT_CONFIGURED' | 'BAD_REQUEST' | 'UPSTREAM' | 'NOT_FOUND'
  message: string
}
