// 판정 로직 경계값 확인: npm run check:classify
import assert from 'node:assert/strict'
import { classify } from '../src/lib/classify'
import type { Destination, RouteResult, Station } from '../src/types'

const st = (id: string, type: Station['type'], lat: number, lng: number): Station => ({
  id, name: id, type, department: '테스트', sigungu: '테스트시', address: '', lat, lng, status: '운영', note: '',
})
const stations = [
  st('A', 'center', 36.5, 127.0),
  st('B', 'local', 36.51, 127.0),
  st('C', 'dedicated', 36.52, 127.0),
  st('D', 'center', 36.53, 127.0),
  st('E', 'center', 36.54, 127.0),
  st('FAR', 'center', 38.5, 127.0), // 약 220km — 30분×150km/h(75km) 밖
  { ...st('NOCOORD', 'local', 0, 0), lat: null, lng: null },
]
const ok = (o: string, sec: number): RouteResult => ({
  originId: o, destId: 'pt', status: 'ok', durationSec: sec, distanceM: 1000, method: 'single', computedAt: '',
})
const results = new Map<string, RouteResult>([
  ['B', ok('B', 1800)],
  ['C', ok('C', 1801)],
  ['D', { ...ok('D', 0), status: 'failed', durationSec: null, distanceM: null }],
  ['A', ok('A', 600)],
])

// 지점 목적지 (관서가 아님) — 모든 관서가 출발지가 된다
const point: Destination = { id: 'pt:36.50000,127.00000', kind: 'point', name: 'x', address: '', lat: 36.5, lng: 127.0 }
const all = new Set(['center', 'local', 'dedicated'] as const)
const a = classify({ stations, dest: point, results, limitMin: 30, originTypes: all, skipSpeedKmh: 150 })
const v = Object.fromEntries(a.rows.map((r) => [r.station.id, r.verdict]))

assert.equal(v.A, 'within')
assert.equal(v.B, 'within', '정확히 1800초는 가능')
assert.equal(v.C, 'over', '1801초는 초과')
assert.equal(v.D, 'failed')
assert.equal(v.E, 'pending')
assert.equal(v.FAR, 'skipped')
assert.equal(v.NOCOORD, 'failed')
assert.equal(a.stats.targets, 7)
assert.equal(a.stats.within, 2, '실패·미계산은 가능 수에 넣지 않는다')
assert.equal(a.stats.withinByType.center + a.stats.withinByType.local + a.stats.withinByType.dedicated, a.stats.within)
assert.equal(a.stats.histogram.reduce((n, b) => n + b.count, 0), 3, '분포는 성공 결과만 센다')
assert.equal(a.stats.histogram.find((b) => b.to === 30)!.count, 1, '30분 정각은 25~30 칸')
assert.equal(a.stats.nearest?.station.id, 'A')

// 관서 목적지 — 자기 자신은 제외
const destA: Destination = { id: 'A', kind: 'station', name: 'A', address: '', lat: 36.5, lng: 127.0, stationType: 'center' }
const b = classify({ stations, dest: destA, results, limitMin: 30, originTypes: all, skipSpeedKmh: 150 })
assert.ok(!b.rows.some((r) => r.station.id === 'A'), '목적지 관서 자신은 분석 대상에서 빠진다')
assert.equal(b.stats.targets, 6)

// 기준시간을 내리면 다시 호출 없이 판정만 바뀐다
const c = classify({ stations, dest: point, results, limitMin: 20, originTypes: all, skipSpeedKmh: 150 })
assert.equal(c.rows.find((r) => r.station.id === 'B')!.verdict, 'over')

// 출발 유형 필터
const d = classify({ stations, dest: point, results, limitMin: 30, originTypes: new Set(['local'] as const), skipSpeedKmh: 150 })
assert.deepEqual(d.rows.map((r) => r.station.id).sort(), ['B', 'NOCOORD'])

console.log('classify: 모든 경계값 확인 통과')
