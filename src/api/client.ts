import type { ApiError, Destination, PublicConfig, RoutePathResponse, RoutesRequest, RoutesResponse } from '../types'

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiError['code'] | 'NETWORK',
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiFailure('NETWORK', '서버에 연결할 수 없습니다.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiFailure(body?.code ?? 'UPSTREAM', body?.message ?? `서버 오류 (${res.status})`)
  return body as T
}

export const fetchConfig = () => call<PublicConfig>('/api/config')

/** 관서 목적지는 id 로, 지점 목적지는 좌표로 보낸다. 서버가 관서 좌표를 직접 찾으므로 관서 좌표는 조작될 수 없다. */
function destParams(dest: Destination): Pick<RoutesRequest, 'destId' | 'destPoint'> {
  return dest.kind === 'station' ? { destId: dest.id } : { destPoint: { lat: dest.lat, lng: dest.lng } }
}

export const fetchRoutes = (dest: Destination, originIds: string[], signal?: AbortSignal) =>
  call<RoutesResponse>('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...destParams(dest), originIds } satisfies RoutesRequest),
    signal,
  })

export function fetchRoutePath(originId: string, dest: Destination, signal?: AbortSignal) {
  const q = new URLSearchParams({ originId })
  if (dest.kind === 'station') q.set('destId', dest.id)
  else {
    q.set('lat', String(dest.lat))
    q.set('lng', String(dest.lng))
  }
  return call<RoutePathResponse>(`/api/route-path?${q}`, { signal })
}
