// (출발 좌표, 도착 좌표, 경로 기준) → 결과 메모리 캐시.
// 좌표를 키로 쓰므로 관서 데이터를 교체해 좌표가 바뀌면 자연히 새로 계산된다.
// 보관 기간은 카카오모빌리티 약관에 맞춰 CACHE_TTL_HOURS 로 조정한다. 서버가 재시작되면 비워진다.
import type { RouteResult } from '../src/types.js'

export class RouteCache {
  private store = new Map<string, { value: RouteResult; expires: number }>()
  private inflight = new Map<string, Promise<RouteResult>>()

  constructor(private readonly ttlMs: number) {}

  static key(o: { lat: number; lng: number }, d: { lat: number; lng: number }, priority: string) {
    const f = (n: number) => n.toFixed(6)
    return `${f(o.lng)},${f(o.lat)}|${f(d.lng)},${f(d.lat)}|${priority}`
  }

  get(key: string): RouteResult | undefined {
    const hit = this.store.get(key)
    if (!hit) return undefined
    if (hit.expires < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return hit.value
  }

  /** 실패 결과는 저장하지 않는다 — 일시 오류가 TTL 동안 굳어 버리지 않도록. */
  set(key: string, value: RouteResult) {
    if (value.status === 'ok') this.store.set(key, { value, expires: Date.now() + this.ttlMs })
  }

  /** 같은 키의 요청이 이미 진행 중이면 그 결과를 함께 기다린다. */
  dedupe(key: string, run: () => Promise<RouteResult>): Promise<RouteResult> {
    const running = this.inflight.get(key)
    if (running) return running
    const p = run().finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }

  get size() {
    return this.store.size
  }
}
