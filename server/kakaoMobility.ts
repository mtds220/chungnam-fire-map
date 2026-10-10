// 카카오모빌리티 길찾기 API 호출. 응답을 RouteResult 로 정규화하는 일까지만 한다.
// 실패한 경로에는 시간·거리를 넣지 않는다 — 임의 값을 만들지 않는 것이 원칙이다.
import type { RouteResult } from '../src/types.js'

const BASE = 'https://apis-navi.kakaomobility.com'

/** 다중 출발지 API 의 출발지 수 상한 (일반 키) */
export const MULTI_ORIGIN_MAX = 30
/** 다중 출발지 API 의 반경 상한 (일반 키). 제휴 API 는 20 km. */
export const MULTI_ORIGIN_RADIUS_LIMIT_M = 10_000
/** 다중 출발지·단건 모두 같은 기준으로 맞춘다. 다중 출발지는 RECOMMEND 를 지원하지 않는다. */
export const PRIORITY = 'TIME'

export interface Point {
  key: string
  lng: number
  lat: number
}

export class NotConfiguredError extends Error {}
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export class KakaoMobility {
  calls = { multi: 0, single: 0 }

  constructor(private readonly restKey: string | undefined) {}

  get configured() {
    return Boolean(this.restKey)
  }

  private async request(kind: 'multi' | 'single', path: string, init?: RequestInit, signal?: AbortSignal): Promise<any> {
    if (!this.restKey) throw new NotConfiguredError('KAKAO_REST_KEY 가 설정되지 않았습니다.')
    this.calls[kind] += 1 // 실제로 보낸 요청만 센다 (사용량·비용 확인용)
    const res = await fetch(BASE + path, {
      ...init,
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: {
        Authorization: `KakaoAK ${this.restKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    const text = await res.text()
    if (res.status === 401 || res.status === 403)
      throw new NotConfiguredError(`카카오 인증 실패(${res.status}): REST 키 또는 길찾기 사용 권한을 확인하세요.`)
    if (!res.ok) throw new UpstreamError(`카카오 API 오류 ${res.status}: ${text.slice(0, 200)}`, res.status)
    return JSON.parse(text)
  }

  /** 여러 출발지 → 목적지 하나. 출발지는 MULTI_ORIGIN_MAX 이하, 모두 radius 안이어야 한다. */
  async multiOrigin(origins: Point[], dest: Point, radiusM: number): Promise<RouteResult[]> {
    const body = {
      origins: origins.map((o) => ({ x: o.lng, y: o.lat, key: o.key })),
      destination: { x: dest.lng, y: dest.lat },
      radius: Math.min(radiusM, MULTI_ORIGIN_RADIUS_LIMIT_M),
      priority: PRIORITY,
    }
    const json = await this.request('multi', '/v1/origins/directions', { method: 'POST', body: JSON.stringify(body) })
    const now = new Date().toISOString()
    const byKey = new Map<string, any>((json.routes ?? []).map((r: any) => [String(r.key), r]))
    return origins.map((o) => normalize(byKey.get(o.key), o.key, dest.key, 'multi', now))
  }

  /** 출발지 하나 → 목적지. withPath 면 경로 좌표도 돌려준다. */
  async single(origin: Point, dest: Point, withPath = false) {
    const q = new URLSearchParams({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${dest.lng},${dest.lat}`,
      priority: PRIORITY,
      summary: withPath ? 'false' : 'true',
    })
    const json = await this.request('single', `/v1/directions?${q}`)
    const route = json.routes?.[0]
    const result = normalize(route, origin.key, dest.key, 'single', new Date().toISOString())
    let path: [number, number][] = []
    if (withPath && result.status === 'ok') {
      for (const section of route.sections ?? [])
        for (const road of section.roads ?? []) {
          const v: number[] = road.vertexes ?? []
          for (let i = 0; i + 1 < v.length; i += 2) path.push([v[i], v[i + 1]])
        }
    }
    return { result, path }
  }
}

function normalize(route: any, originId: string, destId: string, method: RouteResult['method'], computedAt: string): RouteResult {
  const base = { originId, destId, method, computedAt }
  if (!route) return { ...base, status: 'failed', durationSec: null, distanceM: null, errorCode: 'NO_ROUTE', errorMessage: '응답에 경로가 없음' }
  const duration = route.summary?.duration
  const distance = route.summary?.distance
  if (route.result_code !== 0 || typeof duration !== 'number') {
    return {
      ...base,
      status: 'failed',
      durationSec: null,
      distanceM: null,
      errorCode: String(route.result_code ?? 'UNKNOWN'),
      errorMessage: route.result_msg ?? '경로 탐색 실패',
    }
  }
  return { ...base, status: 'ok', durationSec: duration, distanceM: typeof distance === 'number' ? distance : null }
}
