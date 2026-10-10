// 카카오맵 SDK 의 services 라이브러리(JS 키로 동작)로 주소 ↔ 좌표를 바꾼다.
// SDK 가 아직 로드되지 않았으면 빈 결과를 돌려준다.

export interface Place {
  name: string
  address: string
  lat: number
  lng: number
  kind: 'address' | 'place'
}

const services = () => window.kakao?.maps?.services

/** 좌표 → 도로명 주소(없으면 지번 주소) */
export function reverseGeocode(lat: number, lng: number): Promise<string> {
  const svc = services()
  if (!svc) return Promise.resolve('')
  return new Promise((resolve) => {
    new svc.Geocoder().coord2Address(lng, lat, (result: any[], status: string) => {
      if (status !== svc.Status.OK || !result?.length) return resolve('')
      const r = result[0]
      resolve(r.road_address?.address_name || r.address?.address_name || '')
    })
  })
}

/** 주소 검색 + 장소(키워드) 검색을 합쳐 돌려준다. 주소가 정확히 맞으면 앞에 온다. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const svc = services()
  const q = query.trim()
  if (!svc || q.length < 2) return []

  const byAddress = new Promise<Place[]>((resolve) => {
    new svc.Geocoder().addressSearch(q, (result: any[], status: string) => {
      if (status !== svc.Status.OK) return resolve([])
      resolve(
        result.slice(0, 5).map((r) => ({
          name: r.address_name,
          address: r.road_address?.address_name || r.address_name,
          lat: Number(r.y),
          lng: Number(r.x),
          kind: 'address' as const,
        })),
      )
    })
  })

  const byKeyword = new Promise<Place[]>((resolve) => {
    // 충남 중심에서 가까운 순으로. 다른 지역 결과도 나오지만 앞쪽에 충남이 온다.
    const center = new window.kakao.maps.LatLng(36.55, 126.85)
    new svc.Places().keywordSearch(
      q,
      (result: any[], status: string) => {
        if (status !== svc.Status.OK) return resolve([])
        resolve(
          result.slice(0, 8).map((r) => ({
            name: r.place_name,
            address: r.road_address_name || r.address_name,
            lat: Number(r.y),
            lng: Number(r.x),
            kind: 'place' as const,
          })),
        )
      },
      { location: center, sort: svc.SortBy.DISTANCE },
    )
  })

  const [a, k] = await Promise.all([byAddress, byKeyword])
  return [...a, ...k]
}
