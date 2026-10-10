// 화면(dist/)과 길찾기 대리 API(/api/*)를 함께 내보내는 서버.
// REST 키는 이 프로세스의 환경변수에만 있고 브라우저로 나가지 않는다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type Request, type Response } from 'express'
import { pointId, type ApiError, type PublicConfig, type RoutePathResponse, type RoutesRequest, type RoutesResponse, type StationDataset } from '../src/types.js'
import { KakaoMobility, MULTI_ORIGIN_RADIUS_LIMIT_M, NotConfiguredError, PRIORITY } from './kakaoMobility.js'
import { RouteService, type DestLike } from './routeService.js'

const env = process.env
const PORT = Number(env.PORT ?? 8787)
const radiusRequested = Number(env.MULTI_ORIGIN_RADIUS_M ?? 10_000)
const RADIUS_M = Math.min(radiusRequested, MULTI_ORIGIN_RADIUS_LIMIT_M)
if (radiusRequested > MULTI_ORIGIN_RADIUS_LIMIT_M)
  console.warn(`[설정] MULTI_ORIGIN_RADIUS_M=${radiusRequested} 은 일반 API 상한(10000)을 넘어 10000 으로 낮춥니다.`)
const TTL_MS = Number(env.CACHE_TTL_HOURS ?? 24) * 3_600_000
const SKIP_SPEED_KMH = Number(env.SKIP_SPEED_KMH ?? 150)
const ROUTES_PER_MIN = Number(env.ROUTES_PER_MIN ?? 30)
const PATHS_PER_MIN = Number(env.PATHS_PER_MIN ?? 120)

const dataset: StationDataset = JSON.parse(readFileSync(resolve('src/data/stations.json'), 'utf8'))
const byId = new Map(dataset.stations.map((s) => [s.id, s]))

// 지도에서 찍은 지점은 충남과 그 인접 지역까지만 받는다 (쿼터 보호)
const BOUNDS = { minLat: 35.6, maxLat: 37.5, minLng: 125.4, maxLng: 128.0 }

/** 관서 id 또는 지점 좌표 → 목적지. 잘못된 입력이면 null */
function resolveDest(destId: unknown, lat: unknown, lng: unknown): DestLike | null {
  if (typeof destId === 'string' && destId && !destId.startsWith('pt:')) {
    const st = byId.get(destId)
    return st && st.lat != null && st.lng != null ? { id: st.id, lat: st.lat, lng: st.lng } : null
  }
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  if (la < BOUNDS.minLat || la > BOUNDS.maxLat || lo < BOUNDS.minLng || lo > BOUNDS.maxLng) return null
  return { id: pointId(la, lo), lat: la, lng: lo }
}

const kakao = new KakaoMobility(env.KAKAO_REST_KEY || undefined)
const service = new RouteService(kakao, { radiusM: RADIUS_M, ttlMs: TTL_MS })
const startedAt = new Date().toISOString()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1) // Render 등 프록시 뒤에서 실제 IP 로 제한하기 위해
app.use(express.json({ limit: '64kb' }))

// 기본 보안 헤더. CSP 는 카카오맵 SDK 가 여러 도메인에서 스크립트·타일을 불러오므로 걸지 않는다.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// 호스팅의 상태 확인용 — 키 값은 내보내지 않고 설정 여부만 알린다
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, stations: dataset.count, mobilityConfigured: kakao.configured, mapConfigured: Boolean(env.KAKAO_JS_KEY) })
})

const fail = (res: Response, status: number, code: ApiError['code'], message: string) =>
  res.status(status).json({ code, message } satisfies ApiError)

app.get('/api/config', (_req, res) => {
  res.json({
    kakaoJsKey: env.KAKAO_JS_KEY || null,
    mobilityConfigured: kakao.configured,
    multiOriginRadiusM: RADIUS_M,
    skipSpeedKmh: SKIP_SPEED_KMH,
    priority: PRIORITY,
  } satisfies PublicConfig)
})

// 공개 배포에서 쿼터를 지키기 위한 최소한의 IP 별 제한
// 분석(/routes)과 경로선(/route-path)은 따로 센다 — "경로 모두 보기"가 분석 요청을 막지 않도록
const hits = new Map<string, number[]>()
function rateLimited(req: Request, bucket: 'routes' | 'path') {
  const key = `${bucket}:${req.ip ?? 'unknown'}`
  const limit = bucket === 'routes' ? ROUTES_PER_MIN : PATHS_PER_MIN
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > limit
}

app.post('/api/routes', async (req, res) => {
  if (rateLimited(req, 'routes')) return fail(res, 429, 'BAD_REQUEST', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.')
  const body = req.body as Partial<RoutesRequest>
  const dest = resolveDest(body.destId, body.destPoint?.lat, body.destPoint?.lng)
  if (!dest) return fail(res, 400, 'BAD_REQUEST', '목적지를 찾을 수 없거나 분석 가능 지역(충남 인근) 밖입니다.')
  if (!Array.isArray(body.originIds) || body.originIds.length === 0 || body.originIds.length > 60)
    return fail(res, 400, 'BAD_REQUEST', '출발 관서는 1~60곳씩 보내야 합니다.')
  const origins = body.originIds.map((id) => byId.get(String(id))).filter((s) => s != null)
  try {
    const out = await service.compute(dest, origins)
    console.log(
      `[routes] → ${dest.id}: 출발 ${origins.length}곳 · 다중 ${out.calls.multi}회 · 단건 ${out.calls.single}회 · 캐시 ${out.calls.cached}건`,
    )
    res.json(out satisfies RoutesResponse)
  } catch (e) {
    if (e instanceof NotConfiguredError) return fail(res, 503, 'NOT_CONFIGURED', e.message)
    console.error(e)
    fail(res, 502, 'UPSTREAM', e instanceof Error ? e.message : '경로 계산 실패')
  }
})

app.get('/api/route-path', async (req, res) => {
  if (rateLimited(req, 'path')) return fail(res, 429, 'BAD_REQUEST', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.')
  const origin = byId.get(String(req.query.originId))
  const dest = resolveDest(req.query.destId, req.query.lat, req.query.lng)
  if (!origin || !dest) return fail(res, 400, 'BAD_REQUEST', '관서를 찾을 수 없습니다.')
  try {
    const { result, path } = await service.path(origin, dest)
    if (result.status !== 'ok' || result.durationSec == null)
      return fail(res, 404, 'NOT_FOUND', result.errorMessage ?? '경로를 찾지 못했습니다.')
    res.json({
      originId: origin.id,
      destId: dest.id,
      durationSec: result.durationSec,
      distanceM: result.distanceM ?? 0,
      path,
    } satisfies RoutePathResponse)
  } catch (e) {
    if (e instanceof NotConfiguredError) return fail(res, 503, 'NOT_CONFIGURED', e.message)
    fail(res, 502, 'UPSTREAM', e instanceof Error ? e.message : '경로 조회 실패')
  }
})

app.get('/api/usage', (_req, res) => {
  res.json({ since: startedAt, calls: kakao.calls, cachedRoutes: service.cache.size })
})

app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', '없는 API 입니다.'))

// 운영 모드: 빌드된 화면을 함께 내보낸다
const dist = resolve('dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/.*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}  관서 ${dataset.count}곳 · 길찾기 ${kakao.configured ? '연결' : '미설정'} · 다중출발지 반경 ${RADIUS_M}m`)
})
