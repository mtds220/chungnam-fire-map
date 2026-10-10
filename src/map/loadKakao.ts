// 카카오맵 JavaScript SDK 동적 로드. 키는 서버의 /api/config 에서 받는다(소스에 넣지 않는다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Kakao = any

declare global {
  interface Window {
    kakao?: Kakao
  }
}

let loading: Promise<Kakao> | null = null

export function loadKakaoMaps(appKey: string): Promise<Kakao> {
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=clusterer,services`
    script.async = true
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵 SDK 를 초기화하지 못했습니다. JavaScript 키와 등록 도메인을 확인하세요.'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao))
    }
    script.onerror = () => {
      loading = null
      reject(new Error('카카오맵 SDK 를 불러오지 못했습니다. 네트워크 또는 등록 도메인을 확인하세요.'))
    }
    document.head.appendChild(script)
  })
  return loading
}
