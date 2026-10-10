// 직선거리 계산. 오직 (1) 다중 출발지 반경 분류와 (2) 물리적으로 닿을 수 없는 관서의 호출 생략에만 쓴다.
// 도착 가능 여부를 이 값으로 판정하지 않는다.

const R = 6_371_000

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** 기준시간 안에 이 속도로도 못 가는 직선거리(m). 이보다 멀면 도로로는 더더욱 못 간다. */
export function unreachableBeyondM(limitMin: number, speedKmh: number): number {
  return (limitMin / 60) * speedKmh * 1000
}
