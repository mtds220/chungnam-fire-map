// 지도 마커. 기관 성격이 드러나도록 유형마다 바깥 모양과 안쪽 그림을 다르게 한다.
//   119안전센터   — 방패 + 불꽃   : 상시 출동하는 거점
//   119지역대     — 집           : 안전센터에 딸린 작은 분소
//   전담의용소방대 — 원 + 헬멧     : 의용대원이 모여 출동하는 대
// 색은 보조 수단이다. 회색으로 흐려져도(초과) 모양으로 유형을 알 수 있다.
import type { Verdict } from '../lib/classify'
import { formatMinutes } from '../lib/format'
import type { Station, StationType } from '../types'
import { STATION_TYPES } from '../types'

export const SELECTED_COLOR = '#e65a43'
const MUTED = '#6b6b73'

export type MarkerRole = 'normal' | 'dest' | Verdict

/** 24×24 좌표계의 바깥 모양 */
const OUTLINE: Record<StationType, string> = {
  center: 'M12 1.6 21 4.9v6.4c0 5.6-3.8 9.6-9 11.3-5.2-1.7-9-5.7-9-11.3V4.9Z',
  local: 'M12 2.2 22 10.4V21.4a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9V10.4Z',
  dedicated: 'M12 1.8a10.2 10.2 0 1 1 0 20.4 10.2 10.2 0 0 1 0-20.4Z',
}

/** 안쪽 그림 (흰색) */
const GLYPH: Record<StationType, string> = {
  // 불꽃
  center:
    '<path d="M12.2 6.3c.5 1.9 2.9 3.2 2.9 6.1a3.1 3.1 0 0 1-6.2 0c0-1.2.5-2.2 1.2-2.9.1 1 .6 1.7 1.3 1.9-.4-2 0-3.7.8-5.1Z"/>',
  // 문
  local: '<rect x="9.6" y="13.2" width="4.8" height="6.4" rx=".6"/><rect x="5.6" y="12.4" width="2.6" height="2.6" rx=".4"/>',
  // 소방 헬멧: 몸체 + 챙 + 앞 볏
  dedicated:
    '<path d="M6.4 14.4a5.6 5.6 0 0 1 11.2 0Z"/><rect x="5" y="14.6" width="14" height="1.9" rx=".95"/><rect x="11.1" y="7.2" width="1.8" height="4.2" rx=".9" fill="currentColor"/>',
}

interface Paint {
  fill: string
  stroke: string
  strokeWidth: number
  glyph?: string
  dash?: string
}

function icon(type: StationType, size: number, p: Paint) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="color:${p.fill}">
    <path d="${OUTLINE[type]}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" ${p.dash ? `stroke-dasharray="${p.dash}"` : ''}/>
    <g fill="${p.glyph ?? '#fff'}">${GLYPH[type]}</g></svg>`
}

export interface MarkerView {
  role: MarkerRole
  focused: boolean
  durationSec: number | null
}

/** 커스텀 오버레이에 넣을 HTML. 오버레이는 yAnchor 0.5 로 아이콘 중심이 좌표에 오도록 놓는다. */
export function markerHtml(st: Station, v: MarkerView): string {
  const color = STATION_TYPES[st.type].color
  const name = esc(st.name)
  const title = `${name} (${STATION_TYPES[st.type].label})`
  const cls = `mk${v.focused ? ' mk-focus' : ''}`

  switch (v.role) {
    case 'dest':
      return `<div class="mk mk-dest" title="${title}">
        ${icon(st.type, 36, { fill: SELECTED_COLOR, stroke: '#fff', strokeWidth: 1.6 })}
        <span class="mk-label mk-label-dest">${name}</span></div>`
    case 'within':
      return `<div class="${cls} mk-within" title="${title}">
        ${icon(st.type, 26, { fill: color, stroke: '#0a0a0b', strokeWidth: 2 })}
        <span class="mk-badge">${v.durationSec != null ? formatMinutes(v.durationSec) : ''}</span></div>`
    case 'over':
      // 밝은 지도 타일 위에서 묻히지 않도록 반투명 대신 진한 회색으로 낮춘다
      return `<div class="${cls}" style="opacity:.9" title="${title} — 기준 초과">
        ${icon(st.type, 19, { fill: MUTED, stroke: '#fff', strokeWidth: 1.6 })}</div>`
    case 'skipped':
      return `<div class="${cls}" style="opacity:.85" title="${title} — 권역 밖(미계산)">
        ${icon(st.type, 18, { fill: '#f4f4f5', stroke: '#52525b', strokeWidth: 1.5, dash: '2.2 1.6', glyph: '#71717a' })}</div>`
    case 'failed':
      return `<div class="${cls} mk-failed" title="${title} — 분석 불가">?</div>`
    default:
      return `<div class="${cls}" title="${title}">${icon(st.type, 22, { fill: color, stroke: '#fff', strokeWidth: 1.6 })}</div>`
  }
}

/** 지도에서 찍은 지점 목적지 — 핀 끝이 좌표에 오도록 yAnchor 1 로 놓는다 */
export function pointPinHtml(label: string): string {
  return `<div class="mk-pin" title="${esc(label)}">
    <svg width="30" height="40" viewBox="0 0 28 38" aria-hidden="true">
      <path d="M14 1C7 1 1.5 6.4 1.5 13.2 1.5 22.5 14 37 14 37s12.5-14.5 12.5-23.8C26.5 6.4 21 1 14 1z" fill="${SELECTED_COLOR}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="13" r="4.5" fill="#fff"/>
    </svg>
    <span class="mk-label mk-label-dest">${esc(label)}</span></div>`
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 범례·목록용 아이콘 (React 에서 dangerouslySetInnerHTML 로 쓴다) */
export function legendShape(type: StationType, color?: string, size = 16) {
  return icon(type, size, { fill: color ?? STATION_TYPES[type].color, stroke: 'rgba(255,255,255,.85)', strokeWidth: 1.2 })
}

/** 층위: 선택 > 가능 > 미계산 > 초과·불가 순으로 위에 그린다 */
export function zIndexOf(role: MarkerRole): number {
  return { dest: 10, within: 6, normal: 4, pending: 4, failed: 3, over: 2, skipped: 1 }[role]
}
