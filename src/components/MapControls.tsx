import { useStore } from '../store'
import Icon from './Icon'

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  clusterOn: boolean
  onToggleCluster: () => void
}

export default function MapControls({ onZoomIn, onZoomOut, clusterOn, onToggleCluster }: Props) {
  const command = useStore((s) => s.command)
  const dest = useStore((s) => s.dest)

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      <div className="map-ctl-group">
        <button type="button" className="map-ctl" onClick={onZoomIn} aria-label="확대" title="확대">
          <Icon name="add-circle-linear" size={18} />
        </button>
        <button type="button" className="map-ctl" onClick={onZoomOut} aria-label="축소" title="축소">
          <Icon name="minus-circle-linear" size={18} />
        </button>
      </div>
      <div className="map-ctl-group">
        <button type="button" className="map-ctl map-ctl-text" onClick={() => command('reset')} title="충청남도 전체로 되돌리기">
          <Icon name="restart-linear" size={15} />
          초기화
        </button>
        <button type="button" className="map-ctl map-ctl-text" onClick={() => command('fitAll')} title="표시 중인 관서를 모두 보기">
          <Icon name="maximize-square-minimalistic-linear" size={15} />
          전체 관서
        </button>
        <button type="button" className="map-ctl map-ctl-text" disabled={!dest} onClick={() => command('focusDest')} title="분석 목적지로 이동">
          <Icon name="target-linear" size={15} />
          목적지로
        </button>
      </div>
      <button
        type="button"
        className={`glass flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs transition-colors duration-300 ease-spring hover:bg-white/10 ${
          clusterOn ? 'text-fg' : 'text-dim'
        }`}
        aria-pressed={clusterOn}
        onClick={onToggleCluster}
        title="축소했을 때 가까운 관서를 묶어 보여 줍니다"
      >
        <Icon name="widget-4-linear" size={15} />
        묶음 {clusterOn ? '켜짐' : '꺼짐'}
      </button>
    </div>
  )
}
