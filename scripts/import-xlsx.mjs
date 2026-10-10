// 엑셀 원본 → src/data/stations.json
// 사용법: node scripts/import-xlsx.mjs [엑셀 경로]
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import * as XLSX from 'xlsx'

const src = resolve(process.argv[2] ?? '센터, 지역대, 전담대.xlsx')
const out = resolve('src/data/stations.json')

const wb = XLSX.read(readFileSync(src))
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const header = rows[0].map((h) => String(h).trim())
const col = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`열 "${name}"을 찾지 못했습니다. 헤더: ${header.join(', ')}`)
  return i
}
const C = { dept: col('관서'), name: col('명칭'), addr: col('주소'), lat: col('위도'), lng: col('경도') }

// 이름에 들어 있는 낱말로 유형을 정한다. 순서가 중요하다 — 앞에서 먼저 걸린다.
const TYPE_RULES = [
  ['dedicated', '전담의용소방대'],
  ['local', '지역대'],
  ['center', '안전센터'],
]

const stations = []
const excluded = {}
const warnings = []
const seen = new Map()
const counter = { center: 0, local: 0, dedicated: 0 }

rows.slice(1).forEach((r, i) => {
  const rowNo = i + 2
  const name = String(r[C.name]).trim()
  if (!name) return
  const type = TYPE_RULES.find(([, word]) => name.includes(word))?.[0]
  if (!type) {
    excluded[name] = (excluded[name] ?? 0) + 1
    return
  }
  const lat = Number(String(r[C.lat]).trim())
  const lng = Number(String(r[C.lng]).trim())
  const address = String(r[C.addr]).trim()
  const hasCoord = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
  if (!hasCoord) warnings.push(`${rowNo}행 ${name}: 좌표 없음`)
  else if (lat < 35.9 || lat > 37.2 || lng < 125.8 || lng > 127.8)
    warnings.push(`${rowNo}행 ${name}: 충남 범위 밖 좌표 (${lat}, ${lng})`)
  if (seen.has(name)) warnings.push(`${rowNo}행 ${name}: ${seen.get(name)}행과 이름 중복`)
  seen.set(name, rowNo)

  counter[type] += 1
  stations.push({
    id: `${type}-${String(counter[type]).padStart(3, '0')}`,
    name,
    type,
    department: String(r[C.dept]).trim(),
    sigungu: address.split(/\s+/)[0] ?? '',
    address,
    lat: hasCoord ? lat : null,
    lng: hasCoord ? lng : null,
    status: '운영',
    note: '',
    sourceRow: rowNo,
  })
})

writeFileSync(
  out,
  JSON.stringify(
    { source: basename(src), importedAt: new Date().toISOString(), count: stations.length, stations },
    null,
    1,
  ) + '\n',
)

console.log(`저장: ${out}`)
console.log(`포함 ${stations.length}곳 — 안전센터 ${counter.center} · 지역대 ${counter.local} · 전담대 ${counter.dedicated}`)
console.log('제외:', excluded)
if (warnings.length) console.log('경고:\n  ' + warnings.join('\n  '))
