// 출발 관서들 → 목적지 관서의 이동시간 계산.
// 반경 안은 다중 출발지 API 로 묶어 보내고, 반경 밖은 1:1 길찾기로 보완한다.
import type { RouteResult, Station } from '../src/types.js'
import { haversineM } from '../src/lib/geo.js'
import { RouteCache } from './cache.js'
import { KakaoMobility, MULTI_ORIGIN_MAX, NotConfiguredError, PRIORITY, type Point } from './kakaoMobility.js'

const SINGLE_CONCURRENCY = 5

/** 목적지 — 관서이거나 지도에서 찍은 지점 */
export interface DestLike {
  id: string
  lat: number
  lng: number
}

export interface RouteServiceOptions {
  radiusM: number
  ttlMs: number
}

export class RouteService {
  readonly cache: RouteCache

  constructor(
    readonly kakao: KakaoMobility,
    private readonly opts: RouteServiceOptions,
  ) {
    this.cache = new RouteCache(opts.ttlMs)
  }

  async compute(dest: DestLike, origins: Station[]) {
    const destPt: Point = { key: dest.id, lat: dest.lat, lng: dest.lng }
    const calls = { multi: 0, single: 0, cached: 0 }
    const results = new Map<string, RouteResult>()
    const near: { st: Station; key: string }[] = []
    const far: { st: Station; key: string }[] = []

    for (const st of origins) {
      // 좌표가 없는 관서는 계산하지 않는다. 판정은 클라이언트가 '좌표 없음' 으로 한다.
      if (st.lat == null || st.lng == null || st.id === dest.id) continue
      const key = RouteCache.key({ lat: st.lat, lng: st.lng }, destPt, PRIORITY)
      const hit = this.cache.get(key)
      if (hit) {
        results.set(st.id, { ...hit, originId: st.id, destId: dest.id })
        calls.cached += 1
        continue
      }
      const d = haversineM(st.lat, st.lng, destPt.lat, destPt.lng)
      ;(d <= this.opts.radiusM ? near : far).push({ st, key })
    }

    // 1) 반경 안 — 30곳씩 묶어 다중 출발지
    const retrySingle: { st: Station; key: string }[] = []
    for (let i = 0; i < near.length; i += MULTI_ORIGIN_MAX) {
      const chunk = near.slice(i, i + MULTI_ORIGIN_MAX)
      calls.multi += 1
      try {
        const out = await this.kakao.multiOrigin(chunk.map((c) => toPoint(c.st)), destPt, this.opts.radiusM)
        out.forEach((r, j) => {
          if (r.status === 'ok') {
            this.cache.set(chunk[j].key, r)
            results.set(r.originId, r)
          } else retrySingle.push(chunk[j]) // 다중 출발지에서만 실패하는 경우가 있어 단건으로 한 번 더 본다
        })
      } catch (e) {
        if (e instanceof NotConfiguredError) throw e
        retrySingle.push(...chunk)
      }
    }

    // 2) 반경 밖 + 다중 출발지 실패분 — 1:1 길찾기, 동시 SINGLE_CONCURRENCY 개
    const singles = [...far, ...retrySingle]
    let cursor = 0
    const worker = async () => {
      while (cursor < singles.length) {
        const { st, key } = singles[cursor++]
        const r = await this.cache.dedupe(key, async () => {
          calls.single += 1
          try {
            const { result } = await this.kakao.single(toPoint(st), destPt)
            this.cache.set(key, result)
            return result
          } catch (e) {
            if (e instanceof NotConfiguredError) throw e
            return failed(st.id, dest.id, e)
          }
        })
        results.set(st.id, { ...r, originId: st.id, destId: dest.id })
      }
    }
    await Promise.all(Array.from({ length: Math.min(SINGLE_CONCURRENCY, singles.length) }, worker))

    return { results: [...results.values()], calls }
  }

  async path(origin: Station, dest: DestLike) {
    return this.kakao.single(toPoint(origin), { key: dest.id, lat: dest.lat, lng: dest.lng }, true)
  }
}

function toPoint(s: Station): Point {
  if (s.lat == null || s.lng == null) throw new Error(`${s.name}: 좌표 없음`)
  return { key: s.id, lat: s.lat, lng: s.lng }
}

function failed(originId: string, destId: string, e: unknown): RouteResult {
  return {
    originId,
    destId,
    status: 'failed',
    durationSec: null,
    distanceM: null,
    method: 'single',
    computedAt: new Date().toISOString(),
    errorCode: 'REQUEST_FAILED',
    errorMessage: e instanceof Error ? e.message : String(e),
  }
}
